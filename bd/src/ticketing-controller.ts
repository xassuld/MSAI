import { createHash } from "node:crypto";
import mongoose from "mongoose";
import Stripe from "stripe";
import type { NextFunction, Request, Response } from "express";
import { getChristmasEvent, getRegistrationRetryAfter } from "./event-data.js";
import { deliverAdmissionTicket } from "./admission-ticket-delivery.js";
import { mongooseReady } from "./mongoose.js";
import {
  EventModel,
  PaymentAuthorizationModel,
  TicketModel,
  type TicketDocument,
} from "./models.js";
import {
  finishPaymentAuthorization,
  recordPaymentAuthorization,
} from "./payment-authorizations.js";
import {
  ensureChristmasEventState,
  generateTicketCode,
  getTicketPrices,
  resolveTicketTier,
  ticketTiers,
} from "./ticketing.js";

const onlineTicketLimit = 100;
const totalTicketLimit = 120;
let stripeClient: Stripe | undefined;

function getStripe(): Stripe {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) throw new Error("STRIPE_SECRET_KEY is required.");
  stripeClient ??= new Stripe(secretKey);
  return stripeClient;
}

export async function createCheckoutSession(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  const name =
    typeof request.body?.name === "string"
      ? request.body.name.trim().replace(/\s+/g, " ")
      : "";
  const email =
    typeof request.body?.email === "string"
      ? request.body.email.trim().toLowerCase()
      : "";

  if (
    !name ||
    name.length > 120 ||
    /[\u0000-\u001f\u007f]/.test(name) ||
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    request.body?.consent !== true
  ) {
    response.status(400).json({
      error: "Enter a valid name and email, and agree to the ticket terms.",
    });
    return;
  }

  try {
    const ipAddress = request.ip || request.socket.remoteAddress || "unknown";
    const retryAfter = await getRegistrationRetryAfter(
      createHash("sha256").update(ipAddress).digest("hex"),
    );
    if (retryAfter > 0) {
      response
        .set("Retry-After", String(retryAfter))
        .status(429)
        .json({ error: "Too many checkout attempts. Try again later." });
      return;
    }

    await mongooseReady;
    await ensureChristmasEventState(await getChristmasEvent());
    const event = await EventModel.findById("christmas")
      .select("soldCount onlineSoldCount onlineReservedCount ticketPrices")
      .lean();
    const onlineSoldCount = event?.onlineSoldCount ?? 0;
    const onlineReservedCount = event?.onlineReservedCount ?? 0;
    if (
      onlineSoldCount + onlineReservedCount >= onlineTicketLimit ||
      (event?.soldCount ?? 0) + onlineReservedCount >= totalTicketLimit
    ) {
      response.status(409).json({ error: "Event is completely sold out." });
      return;
    }

    const tier = resolveTicketTier(
      onlineSoldCount + onlineReservedCount,
      getTicketPrices(event?.ticketPrices),
    );
    const frontendUrl = process.env.FRONTEND_URL;
    if (!frontendUrl) throw new Error("FRONTEND_URL is required.");
    const baseUrl = new URL(frontendUrl).origin;
    const checkoutParams: Stripe.Checkout.SessionCreateParams = {
      line_items: [
        {
          price_data: {
            currency: "eur",
            unit_amount: tier.amountInCents,
            product_data: {
              name: `MSAI Christmas Party — ${tier.name} Ticket`,
              description: "General Admission with Food & Party Inclusions",
            },
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      payment_intent_data: {
        capture_method: "automatic",
      },
      customer_email: email,
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
      metadata: {
        eventId: "christmas",
        name,
        email,
        tier: tier.key,
        amountCents: String(tier.amountInCents),
      },
      success_url: `${baseUrl}/events/christmas/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/events/christmas`,
    };
    const session = await getStripe().checkout.sessions.create(checkoutParams);

    if (!session.url) {
      throw new Error("Stripe did not return a Checkout URL.");
    }
    response.json({ checkoutUrl: session.url });
  } catch (error) {
    next(error);
  }
}

export async function handleStripeWebhook(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  const signature = request.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!signature || !webhookSecret || !Buffer.isBuffer(request.body)) {
    response.status(400).json({ error: "Invalid Stripe webhook request." });
    return;
  }

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(
      request.body,
      signature,
      webhookSecret,
    );
  } catch (error) {
    console.error(
      "Stripe webhook signature verification failed.",
      error instanceof Error ? `${error.name}: ${error.message}` : "Unknown error",
    );
    response.status(400).json({ error: "Invalid Stripe webhook signature." });
    return;
  }

  try {
    if (event.type === "checkout.session.completed") {
      const checkoutSession = event.data.object;
      if (checkoutSession.payment_status === "paid") {
        const status = await fulfillPaidCheckoutSession(checkoutSession);
        if (status === "processing") {
          throw new Error("Stripe ticket email delivery is already in progress.");
        }
      } else {
        await recordAuthorizedCheckoutSession(checkoutSession);
      }
    } else if (event.type === "payment_intent.amount_capturable_updated") {
      const checkoutSession = await getCheckoutSessionForPaymentIntent(
        event.data.object.id,
      );
      if (checkoutSession?.metadata?.eventId === "christmas") {
        await recordAuthorizedCheckoutSession(checkoutSession);
      }
    } else if (event.type === "payment_intent.succeeded") {
      const checkoutSession = await getCheckoutSessionForPaymentIntent(
        event.data.object.id,
      );
      if (checkoutSession?.metadata?.eventId === "christmas") {
        if (checkoutSession.payment_status !== "paid") {
          throw new Error("Succeeded Stripe PaymentIntent has an unpaid Checkout session.");
        }
        const status = await fulfillPaidCheckoutSession(checkoutSession);
        if (status === "processing") {
          throw new Error("Stripe ticket email delivery is already in progress.");
        }
      }
    } else if (event.type === "payment_intent.canceled") {
      await finishPaymentAuthorization(event.data.object.id, "released");
    }
    response.json({ received: true });
  } catch (error) {
    next(error);
  }
}

export async function confirmCheckoutSession(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  const sessionId =
    typeof request.body?.sessionId === "string"
      ? request.body.sessionId.trim()
      : "";
  if (!/^cs_(?:test|live)_[A-Za-z0-9]+$/.test(sessionId)) {
    response.status(400).json({ error: "A valid Checkout session is required." });
    return;
  }

  try {
    const checkoutSession = await getStripe().checkout.sessions.retrieve(sessionId);
    if (checkoutSession.metadata?.eventId !== "christmas") {
      response.status(404).json({ error: "Checkout session not found." });
      return;
    }
    if (checkoutSession.payment_status !== "paid") {
      const authorizationStatus =
        await recordAuthorizedCheckoutSession(checkoutSession);
      response.json({
        status:
          authorizationStatus === "recorded" ||
          authorizationStatus === "alreadyRecorded"
            ? "hold_reserved"
            : authorizationStatus === "soldOut"
              ? "hold_released"
            : "awaiting_payment",
      });
      return;
    }

    response.json({
      status: await fulfillPaidCheckoutSession(checkoutSession),
    });
  } catch (error) {
    next(error);
  }
}

async function getCheckoutSessionForPaymentIntent(
  paymentIntentId: string,
): Promise<Stripe.Checkout.Session | null> {
  const sessions = await getStripe().checkout.sessions.list({
    payment_intent: paymentIntentId,
    limit: 1,
  });
  return sessions.data[0] ?? null;
}

async function recordAuthorizedCheckoutSession(
  checkoutSession: Stripe.Checkout.Session,
): Promise<"recorded" | "alreadyRecorded" | "soldOut" | "ignored"> {
  if (
    checkoutSession.status !== "complete" ||
    checkoutSession.id.startsWith("cs_test_") ||
    checkoutSession.metadata?.eventId !== "christmas"
  ) {
    return "ignored";
  }

  const paymentIntentId =
    typeof checkoutSession.payment_intent === "string"
      ? checkoutSession.payment_intent
      : checkoutSession.payment_intent?.id;
  if (!paymentIntentId) return "ignored";

  const paymentIntent = await getStripe().paymentIntents.retrieve(
    paymentIntentId,
    { expand: ["latest_charge"] },
  );
  if (
    paymentIntent.status !== "requires_capture" ||
    paymentIntent.amount_capturable < 1
  ) {
    return "ignored";
  }

  const metadata = checkoutSession.metadata;
  const tierKey = metadata.tier;
  const amountCents = metadata.amountCents
    ? Number(metadata.amountCents)
    : undefined;
  if (
    !metadata.name?.trim() ||
    !metadata.email?.trim() ||
    !tierKey ||
    !Object.hasOwn(ticketTiers, tierKey) ||
    !Number.isInteger(checkoutSession.amount_total) ||
    !Number.isSafeInteger(amountCents) ||
    paymentIntent.amount_capturable !== checkoutSession.amount_total ||
    checkoutSession.amount_total !== amountCents ||
    paymentIntent.currency !== checkoutSession.currency
  ) {
    throw new Error("Authorized Stripe Checkout session has invalid fulfillment metadata.");
  }

  const latestCharge =
    typeof paymentIntent.latest_charge === "object"
      ? paymentIntent.latest_charge
      : null;
  const paymentMethodDetails = latestCharge?.payment_method_details;
  const captureBefore =
    paymentMethodDetails?.card?.capture_before ??
    paymentMethodDetails?.card_present?.capture_before;
  const expiresAt = new Date(
    (captureBefore ?? paymentIntent.created + 7 * 24 * 60 * 60) * 1000,
  );
  if (expiresAt <= new Date()) {
    await getStripe().paymentIntents.cancel(paymentIntent.id);
    return "ignored";
  }
  await ensureChristmasEventState(await getChristmasEvent());
  const result = await recordPaymentAuthorization({
    stripeSessionId: checkoutSession.id,
    stripePaymentIntentId: paymentIntent.id,
    name: metadata.name.trim().replace(/\s+/g, " "),
    email: metadata.email.trim().toLowerCase(),
    ticketTier: tierKey as keyof typeof ticketTiers,
    amountAuthorizedCents: paymentIntent.amount_capturable,
    currency: paymentIntent.currency,
    expiresAt,
  });

  if (result === "soldOut") {
    await getStripe().paymentIntents.cancel(paymentIntent.id);
    console.error(
      "OVER CAPACITY: canceled an authorized Christmas ticket checkout.",
      checkoutSession.id,
    );
  }
  return result === "finished" ? "ignored" : result;
}

async function fulfillPaidCheckoutSession(
  checkoutSession: Stripe.Checkout.Session,
): Promise<"confirmed" | "processing" | "awaiting_payment" | "refunded"> {
  if (checkoutSession.payment_status !== "paid") {
    return "awaiting_payment";
  }

  const metadata = checkoutSession.metadata;
  const tierKey = metadata?.tier;
  const paymentIntentId =
    typeof checkoutSession.payment_intent === "string"
      ? checkoutSession.payment_intent
      : checkoutSession.payment_intent?.id;

  const amountCents = metadata?.amountCents
    ? Number(metadata.amountCents)
    : undefined;
  if (
    metadata?.eventId !== "christmas" ||
    !metadata.name?.trim() ||
    !metadata.email?.trim() ||
    !tierKey ||
    !Object.hasOwn(ticketTiers, tierKey) ||
    !Number.isInteger(checkoutSession.amount_total) ||
    (amountCents !== undefined &&
      (!Number.isSafeInteger(amountCents) || amountCents < 1)) ||
    !paymentIntentId
  ) {
    throw new Error("Paid Stripe Checkout session has invalid fulfillment metadata.");
  }

  const tier = tierKey as keyof typeof ticketTiers;
  if (
    checkoutSession.amount_total !==
    (amountCents ?? ticketTiers[tier].amountInCents)
  ) {
    throw new Error("Paid Stripe Checkout session amount does not match its ticket tier.");
  }
  const email = metadata.email.trim().toLowerCase();
  const name = metadata.name.trim().replace(/\s+/g, " ");
  const amountPaidCents = checkoutSession.amount_total!;
  const isSandbox = checkoutSession.id.startsWith("cs_test_");
  let mongoSession: mongoose.ClientSession | undefined;
  try {
    await mongooseReady;
    await ensureChristmasEventState(await getChristmasEvent());
    const activeSession = await mongoose.startSession();
    mongoSession = activeSession;
    const fulfillment: { ticket: TicketDocument | null; overCapacity: boolean } = {
      ticket: null,
      overCapacity: false,
    };
    let activeAuthorization: Awaited<
      ReturnType<typeof PaymentAuthorizationModel.findOne>
    > | null = null;
    await activeSession.withTransaction(async () => {
      fulfillment.ticket = null;
      fulfillment.overCapacity = false;
      activeAuthorization = null;
      const existingTicket = await TicketModel.findOne({
        stripeSessionId: checkoutSession.id,
      }).session(activeSession);
      if (existingTicket) {
        fulfillment.ticket = existingTicket;
        return;
      }

      if (!isSandbox) {
        activeAuthorization = await PaymentAuthorizationModel.findOne({
          stripePaymentIntentId: paymentIntentId,
          status: "authorized",
        }).session(activeSession);
      }

      const updatedEvent = isSandbox
        ? await EventModel.findOneAndUpdate(
            { _id: "christmas" },
            { $inc: { ticketCount: 1 } },
            { new: true, session: activeSession },
          )
        : activeAuthorization
          ? await EventModel.findOneAndUpdate(
              { _id: "christmas", onlineReservedCount: { $gt: 0 } },
              {
                $inc: {
                  soldCount: 1,
                  onlineSoldCount: 1,
                  onlineReservedCount: -1,
                  ticketCount: 1,
                },
              },
              { new: true, session: activeSession },
            )
        : await EventModel.findOneAndUpdate(
            {
              _id: "christmas",
              $expr: {
                $and: [
                  {
                    $lt: [
                      { $add: ["$soldCount", "$onlineReservedCount"] },
                      totalTicketLimit,
                    ],
                  },
                  {
                    $lt: [
                      { $add: ["$onlineSoldCount", "$onlineReservedCount"] },
                      onlineTicketLimit,
                    ],
                  },
                ],
              },
            },
            { $inc: { soldCount: 1, onlineSoldCount: 1, ticketCount: 1 } },
            { new: true, session: activeSession },
          );
      if (!updatedEvent) {
        if (activeAuthorization) {
          throw new Error("Payment hold reservation disappeared before capture.");
        }
        fulfillment.overCapacity = true;
        return;
      }
      if (activeAuthorization) {
        const captured = await PaymentAuthorizationModel.updateOne(
          {
            stripePaymentIntentId: paymentIntentId,
            status: "authorized",
          },
          { $set: { status: "captured" } },
          { session: activeSession },
        );
        if (captured.modifiedCount !== 1) {
          throw new Error("Payment authorization could not be marked captured.");
        }
      }

      [fulfillment.ticket] = await TicketModel.create(
        [
          {
            name,
            email,
            ticketCode: generateTicketCode(),
            ticketNumber: updatedEvent.ticketCount,
            ticketTier: tier,
            amountPaidCents,
            currency: checkoutSession.currency ?? "eur",
            stripeSessionId: checkoutSession.id,
            stripePaymentIntentId: paymentIntentId,
            isPaid: true,
          },
        ],
        { session: activeSession },
      );
    });

    if (fulfillment.overCapacity) {
      await getStripe().refunds.create(
        { payment_intent: paymentIntentId },
        { idempotencyKey: `christmas-overcapacity-${checkoutSession.id}` },
      );
      console.error(
        "OVER CAPACITY: refunded a paid Christmas ticket checkout.",
        checkoutSession.id,
      );
      return "refunded";
    }

    const ticket = fulfillment.ticket;
    if (!ticket) {
      throw new Error("Stripe ticket fulfillment transaction returned no ticket.");
    }
    const deliveryStatus = await deliverAdmissionTicket(ticket);
    return deliveryStatus === "sending" ? "processing" : "confirmed";
  } finally {
    await mongoSession?.endSession();
  }
}

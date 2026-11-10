import { createHash } from "node:crypto";
import mongoose from "mongoose";
import Stripe from "stripe";
import type { NextFunction, Request, Response } from "express";
import { getChristmasEvent, getRegistrationRetryAfter } from "./event-data.js";
import { mongooseReady } from "./mongoose.js";
import { EventModel, TicketModel, type TicketDocument } from "./models.js";
import {
  ensureChristmasEventState,
  generateTicketCode,
  getTicketPrices,
  resolveTicketTier,
  ticketTiers,
} from "./ticketing.js";
import { sendAdmissionTicket } from "./ticket-email.js";

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
      .select("soldCount onlineSoldCount ticketPrices")
      .lean();
    const onlineSoldCount = event?.onlineSoldCount ?? 0;
    if (
      onlineSoldCount >= onlineTicketLimit ||
      (event?.soldCount ?? 0) >= totalTicketLimit
    ) {
      response.status(409).json({ error: "Event is completely sold out." });
      return;
    }

    const tier = resolveTicketTier(
      onlineSoldCount,
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

  if (event.type !== "checkout.session.completed") {
    response.json({ received: true });
    return;
  }

  const checkoutSession = event.data.object;
  if (checkoutSession.payment_status !== "paid") {
    response.json({ received: true });
    return;
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
    next(new Error("Paid Stripe Checkout session has invalid fulfillment metadata."));
    return;
  }

  const tier = tierKey as keyof typeof ticketTiers;
  if (
    checkoutSession.amount_total !==
    (amountCents ?? ticketTiers[tier].amountInCents)
  ) {
    next(new Error("Paid Stripe Checkout session amount does not match its ticket tier."));
    return;
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
    await activeSession.withTransaction(async () => {
      fulfillment.ticket = null;
      fulfillment.overCapacity = false;
      const existingTicket = await TicketModel.findOne({
        stripeSessionId: checkoutSession.id,
      }).session(activeSession);
      if (existingTicket) {
        fulfillment.ticket = existingTicket;
        return;
      }

      const updatedEvent = isSandbox
        ? await EventModel.findOneAndUpdate(
            { _id: "christmas" },
            { $inc: { ticketCount: 1 } },
            { new: true, session: activeSession },
          )
        : await EventModel.findOneAndUpdate(
            {
              _id: "christmas",
              soldCount: { $lt: totalTicketLimit },
              onlineSoldCount: { $lt: onlineTicketLimit },
            },
            { $inc: { soldCount: 1, onlineSoldCount: 1, ticketCount: 1 } },
            { new: true, session: activeSession },
          );
      if (!updatedEvent) {
        fulfillment.overCapacity = true;
        return;
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
      response.json({ received: true });
      return;
    }

    const ticket = fulfillment.ticket;
    if (!ticket) {
      throw new Error("Stripe ticket fulfillment transaction returned no ticket.");
    }
    if (ticket.emailSentAt) {
      response.json({ received: true });
      return;
    }
    if (!ticket.email) {
      throw new Error("Paid ticket has no recipient email.");
    }

    const eventDetails = await getChristmasEvent();
    await sendAdmissionTicket(
      ticket.email,
      ticket.name,
      ticket.ticketCode,
      ticket.ticketTier,
      eventDetails,
      ticket.amountPaidCents,
    );
    await TicketModel.updateOne(
      { stripeSessionId: checkoutSession.id, emailSentAt: { $exists: false } },
      { $set: { emailSentAt: new Date() } },
    );
    response.json({ received: true });
  } catch (error) {
    next(error);
  } finally {
    await mongoSession?.endSession();
  }
}

import { createHash, timingSafeEqual } from "node:crypto";
import cors from "cors";
import { v2 as cloudinary } from "cloudinary";
import express, {
  type ErrorRequestHandler,
  type Request,
  type Response,
} from "express";
import { getAllowedOrigins, validateEnvironment } from "./env.js";
import {
  getChristmasEvent,
  getSentAdmissionTicketCount,
  getSentAdmissionTickets,
  getRegistrationRetryAfter,
  getLoginRetryAfter,
  clearAdmissionTickets,
  recordFailedLogin,
  saveChristmasEvent,
  type EditableEvent,
} from "./event-data.js";
import { getAdminSession } from "./admin-session.js";
import { sendAdmissionTicket } from "./ticket-email.js";
import Stripe from "stripe";
import {
  ensureEventCapacity,
  isTicketTierName,
  reservePaidTicket,
  resolveActiveTicketTier,
  ticketTiers,
} from "./ticketing.js";
import { mongooseReady } from "./mongoose.js";
import { EventModel, TicketModel } from "./models.js";

validateEnvironment();

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

const allowedOrigins = getAllowedOrigins();
const allowedImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxImageSize = 10 * 1024 * 1024;
const fieldLimits = {
  title: 120,
  description: 2000,
  date: 10,
  time: 40,
  location: 240,
  posterUrl: 1000,
  ticketInfo: 1000,
  partyDescription: 2000,
  cashAtGateText: 500,
} as const;

function isAllowedOrigin(origin: string): boolean {
  try {
    const parsedOrigin = new URL(origin);
    if (allowedOrigins.includes(parsedOrigin.origin)) return true;

    return (
      process.env.NODE_ENV !== "production" &&
      parsedOrigin.protocol === "http:" &&
      ["localhost", "127.0.0.1"].includes(parsedOrigin.hostname)
    );
  } catch {
    return false;
  }
}

export const app = express();
app.disable("x-powered-by");
app.set("trust proxy", process.env.TRUST_PROXY === "true");
app.use(
  cors({
    credentials: true,
    origin(origin, callback) {
      if (!origin || isAllowedOrigin(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Request origin not allowed."));
      }
    },
  }),
);

app.post(
  "/api/webhooks/stripe",
  express.raw({ type: "application/json" }),
  async (request, response) => {
    if (!stripe) {
      response.status(503).json({ error: "Stripe is not configured." });
      return;
    }

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(
        request.body as Buffer,
        request.get("stripe-signature") ?? "",
        process.env.STRIPE_WEBHOOK_SECRET!,
      );
    } catch (error) {
      console.error(
        "Stripe webhook signature verification failed.",
        error instanceof Error ? error.message : "Unknown error",
      );
      response.status(400).json({ error: "Invalid Stripe webhook signature." });
      return;
    }

    if (event.type !== "checkout.session.completed") {
      response.json({ received: true });
      return;
    }

    const checkoutSession = event.data.object as Stripe.Checkout.Session;
    if (checkoutSession.payment_status !== "paid") {
      response.json({ received: true });
      return;
    }

    try {
      await mongooseReady;
      const metadata = checkoutSession.metadata ?? {};
      const name = metadata.name?.trim();
      const email = metadata.email?.trim().toLowerCase();
      const tierKey = metadata.tier;
      if (!name || !email || !isTicketTierName(tierKey)) {
        throw new Error("Stripe checkout metadata is incomplete.");
      }
      const tier = ticketTiers[tierKey];

      const existingTicket = await TicketModel.findOne({
        stripeSessionId: checkoutSession.id,
      });
      const ticket =
        existingTicket ??
        (await reservePaidTicket(name, email, { ...tier, key: tierKey }, checkoutSession));
      if (ticket.emailSentAt) {
        response.json({ received: true });
        return;
      }

      const eventData = await getChristmasEvent();
      try {
        await sendAdmissionTicket(
          email,
          name,
          ticket.ticketCode,
          tierKey,
          eventData,
          ticket.amountPaidCents,
        );
        await TicketModel.updateOne(
          { _id: ticket.id },
          { $set: { emailSentAt: new Date() } },
        );
      } catch (error) {
        console.error(
          "Paid admission ticket email failed.",
          error instanceof Error ? `${error.name}: ${error.message}` : "Unknown error",
        );
      }

      response.json({ received: true });
    } catch (error) {
      if (error instanceof Error && error.message === "EVENT_CAPACITY_REACHED") {
        response.status(409).json({ error: "The event is sold out." });
        return;
      }
      console.error(
        "Stripe webhook processing failed.",
        error instanceof Error ? `${error.name}: ${error.message}` : "Unknown error",
      );
      response.status(500).json({ error: "Could not process the paid ticket." });
    }
  },
);

app.use(express.json({ limit: "16kb", type: "application/json" }));

function originAllowed(request: Request): boolean {
  const origin = request.get("origin");
  return origin ? isAllowedOrigin(origin) : false;
}

function requireSameOrigin(request: Request, response: Response): boolean {
  if (originAllowed(request)) return true;
  response.status(403).json({ error: "Request origin not allowed." });
  return false;
}

function eventFieldsAreValid(value: unknown): value is EditableEvent {
  if (typeof value !== "object" || value === null) return false;

  const fields = value as Record<string, unknown>;
  if (
    !Object.entries(fieldLimits).every(
      ([key, limit]) => typeof fields[key] === "string" && fields[key].length <= limit,
    ) ||
    !(fields.title as string).trim() ||
    !ticketPricingAreValid(fields.ticketPricing) ||
    typeof fields.maxCapacity !== "number" ||
    !Number.isInteger(fields.maxCapacity) ||
    fields.maxCapacity < 1 ||
    fields.maxCapacity > 100000 ||
    typeof fields.soldCount !== "number" ||
    !Number.isInteger(fields.soldCount) ||
    fields.soldCount < 0
  ) {
    return false;
  }

  const date = fields.date as string;
  if (date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
    const parsedDate = new Date(`${date}T00:00:00.000Z`);
    if (
      Number.isNaN(parsedDate.getTime()) ||
      parsedDate.toISOString().slice(0, 10) !== date
    ) {
      return false;
    }
  }

  const posterUrl = fields.posterUrl as string;
  if (posterUrl) {
    try {
      const parsedUrl = new URL(posterUrl);
      if (
        parsedUrl.protocol !== "https:" ||
        parsedUrl.hostname !== "res.cloudinary.com"
      ) {
        return false;
      }
    } catch {
      return false;
    }
  }

  return true;
}

function ticketPricingAreValid(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;

  const tiers = value as Record<string, unknown>;
  return ["earlyBird", "regular", "late"].every((name) => {
    const tier = tiers[name];
    if (typeof tier !== "object" || tier === null) return false;

    const fields = tier as Record<string, unknown>;
    return (
      typeof fields.price === "number" &&
      Number.isFinite(fields.price) &&
      fields.price >= 0 &&
      fields.price <= 10000 &&
      typeof fields.startsAt === "string" &&
      isValidDate(fields.startsAt) &&
      typeof fields.endsAt === "string" &&
      isValidDate(fields.endsAt) &&
      fields.startsAt <= fields.endsAt
    );
  });
}

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsedDate = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsedDate.getTime()) && parsedDate.toISOString().slice(0, 10) === value;
}

app.get("/api/health", (_request, response) => {
  response.json({ status: "ok" });
});

app.get("/api/events/christmas", async (_request, response, next) => {
  try {
    response.set("Cache-Control", "no-store");
    response.json(await getChristmasEvent());
  } catch (error) {
    next(error);
  }
});

app.post("/api/events/christmas/checkout", async (request, response, next) => {
  if (!requireSameOrigin(request, response)) return;

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

  if (!stripe) {
    response.status(503).json({ error: "Online ticket payments are not configured." });
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
        .json({ error: "Too many sign-up attempts. Try again later." });
      return;
    }

    const event = await getChristmasEvent();
    const activeTier = resolveActiveTicketTier();
    if (!activeTier) {
      response.status(400).json({ error: "Ticket sales are currently closed" });
      return;
    }

    await ensureEventCapacity(event);
    await mongooseReady;
    const capacity = await EventModel.findById("christmas").lean();
    if (!capacity || capacity.soldCount >= capacity.maxCapacity) {
      response.status(409).json({ error: "The event is sold out." });
      return;
    }

    const frontendUrl = process.env.FRONTEND_URL!.replace(/\/+$/, "");
    const session = await stripe.checkout.sessions.create({
      allowed_payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "eur",
            unit_amount: activeTier.priceCents,
            product_data: {
              name: `MSAI Christmas Event Ticket (${activeTier.name})`,
              description: "Admission ticket for MSAI Christmas Event",
            },
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      customer_email: email,
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
      metadata: {
        name,
        email,
        tier: activeTier.key,
        eventId: "christmas",
      },
      success_url: `${frontendUrl}/events/christmas/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${frontendUrl}/events/christmas`,
    });

    if (!session.url) {
      throw new Error("Stripe did not return a checkout URL.");
    }

    response.json({ checkoutUrl: session.url });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/login", async (request, response, next) => {
  if (!requireSameOrigin(request, response)) return;

  const submittedPassword: unknown = request.body?.password;
  if (
    typeof submittedPassword !== "string" ||
    !submittedPassword ||
    submittedPassword.length > 1024
  ) {
    response.status(401).json({ error: "Incorrect password." });
    return;
  }

  const ipAddress = request.ip || request.socket.remoteAddress || "unknown";

  try {
    const retryAfter = await getLoginRetryAfter(ipAddress);
    if (retryAfter > 0) {
      response
        .set("Retry-After", String(retryAfter))
        .status(429)
        .json({ error: "Too many failed sign-in attempts. Try again later." });
      return;
    }

    const expectedHash = createHash("sha256")
      .update(process.env.ADMIN_PASSWORD!)
      .digest();
    const submittedHash = createHash("sha256").update(submittedPassword).digest();

    if (!timingSafeEqual(expectedHash, submittedHash)) {
      await recordFailedLogin(ipAddress);
      await new Promise((resolve) => setTimeout(resolve, 350));
      response.status(401).json({ error: "Incorrect password." });
      return;
    }

    const session = await getAdminSession(request, response);
    session.isAdmin = true;
    await session.save();
    response.json({ authenticated: true });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/logout", async (request, response, next) => {
  if (!requireSameOrigin(request, response)) return;

  try {
    const session = await getAdminSession(request, response);
    session.destroy();
    response.json({ authenticated: false });
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/events/christmas", async (request, response, next) => {
  try {
    const session = await getAdminSession(request, response);
    if (!session.isAdmin) {
      response.status(401).json({ error: "Admin login required." });
      return;
    }

    response.set("Cache-Control", "no-store");
    response.json(await getChristmasEvent());
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/tickets/stats", async (request, response, next) => {
  try {
    const session = await getAdminSession(request, response);
    if (!session.isAdmin) {
      response.status(401).json({ error: "Admin login required." });
      return;
    }

    response.set("Cache-Control", "no-store");
    response.json({ sentTicketCount: await getSentAdmissionTicketCount() });
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/tickets", async (request, response, next) => {
  try {
    const session = await getAdminSession(request, response);
    if (!session.isAdmin) {
      response.status(401).json({ error: "Admin login required." });
      return;
    }

    const sentTickets = await getSentAdmissionTickets();
    response.set("Cache-Control", "no-store");
    response.json({
      sentTickets: sentTickets.map((ticket) => ({
        ...ticket,
        ticketTier: ticket.ticketTier ?? null,
        emailSentAt: ticket.emailSentAt.toISOString(),
      })),
    });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/admin/tickets", async (request, response, next) => {
  if (!requireSameOrigin(request, response)) return;

  try {
    const session = await getAdminSession(request, response);
    if (!session.isAdmin) {
      response.status(401).json({ error: "Admin login required." });
      return;
    }

    response.set("Cache-Control", "no-store");
    response.json({ deletedCount: await clearAdmissionTickets() });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/tickets/check-in", async (request, response, next) => {
  if (!requireSameOrigin(request, response)) return;

  try {
    const session = await getAdminSession(request, response);
    if (!session.isAdmin) {
      response.status(401).json({ error: "Admin login required." });
      return;
    }

    const ticketCode =
      typeof request.body?.ticketCode === "string"
        ? request.body.ticketCode.trim().toUpperCase()
        : "";
    if (!/^[A-Z0-9]{8}$/.test(ticketCode)) {
      response.status(400).json({ error: "Enter a valid 8-character ticket code." });
      return;
    }

    await mongooseReady;
    const ticket = await TicketModel.findOneAndUpdate(
      { ticketCode, isPaid: true, isCheckedIn: false },
      { $set: { isCheckedIn: true, checkedInAt: new Date() } },
      { new: true },
    );
    if (!ticket) {
      const existingTicket = await TicketModel.findOne({ ticketCode }).lean();
      if (existingTicket?.isPaid && existingTicket.isCheckedIn) {
        response.status(409).json({
          error: "Already scanned",
          checkedInAt: existingTicket.checkedInAt,
        });
      }
      else {
        response.status(404).json({ error: "Paid ticket not found." });
      }
      return;
    }
    response.json({
      name: ticket.name,
      ticketTier: ticket.ticketTier,
      checkedInAt: ticket.checkedInAt,
    });
  } catch (error) {
    next(error);
  }
});

app.put("/api/admin/events/christmas", async (request, response, next) => {
  if (!requireSameOrigin(request, response)) return;

  try {
    const session = await getAdminSession(request, response);
    if (!session.isAdmin) {
      response.status(401).json({ error: "Admin login required." });
      return;
    }

    if (!eventFieldsAreValid(request.body)) {
      response
        .status(400)
        .json({ error: "Check the required title and event fields, then try again." });
      return;
    }

    const fields: EditableEvent = {
      title: request.body.title,
      description: request.body.description,
      date: request.body.date,
      time: request.body.time,
      location: request.body.location,
      posterUrl: request.body.posterUrl,
      ticketInfo: request.body.ticketInfo,
      partyDescription: request.body.partyDescription,
      cashAtGateText: request.body.cashAtGateText,
      ticketPricing: request.body.ticketPricing,
      maxCapacity: request.body.maxCapacity,
      soldCount: request.body.soldCount,
    };

    const savedEvent = await saveChristmasEvent(fields);
    await ensureEventCapacity(savedEvent);
    response.json(savedEvent);
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/upload-signature", async (request, response, next) => {
  if (!requireSameOrigin(request, response)) return;

  try {
    const session = await getAdminSession(request, response);
    if (!session.isAdmin) {
      response.status(401).json({ error: "Admin login required." });
      return;
    }

    const { type, size } = request.body ?? {};
    if (
      typeof type !== "string" ||
      typeof size !== "number" ||
      !allowedImageTypes.has(type) ||
      size < 1 ||
      size > maxImageSize
    ) {
      response
        .status(400)
        .json({ error: "Choose a JPG, PNG, or WebP image up to 10 MB." });
      return;
    }

    const timestamp = Math.floor(Date.now() / 1000);
    const folder = "msai/events";
    const signature = cloudinary.utils.api_sign_request(
      { timestamp, folder },
      process.env.CLOUDINARY_API_SECRET!,
    );

    response.json({
      cloudName: process.env.CLOUDINARY_CLOUD_NAME,
      apiKey: process.env.CLOUDINARY_API_KEY,
      timestamp,
      folder,
      signature,
    });
  } catch (error) {
    next(error);
  }
});

app.use(((error, _request, response, next) => {
  const status =
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof error.status === "number"
      ? error.status
      : 500;

  console.error(
    "Backend request failed.",
    error instanceof Error ? `${error.name}: ${error.message}` : "Unknown error",
  );

  if (response.headersSent) {
    next(error);
    return;
  }
  response.status(status).json({
    error:
      status === 413
        ? "Request body is too large."
        : status >= 500
          ? "The backend could not complete the request."
          : "The request could not be processed.",
  });
}) satisfies ErrorRequestHandler);

export default app;

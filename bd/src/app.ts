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
  getLoginRetryAfter,
  clearUnpaidLegacyTickets,
  recordFailedLogin,
  saveChristmasEvent,
  type EditableEvent,
} from "./event-data.js";
import { getAdminSession } from "./admin-session.js";
import { ensureChristmasEventState } from "./ticketing.js";
import {
  createCheckoutSession,
  handleStripeWebhook,
} from "./ticketing-controller.js";
import { mongooseReady } from "./mongoose.js";
import { EventModel, TicketModel } from "./models.js";

validateEnvironment();

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
  handleStripeWebhook,
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
    typeof fields.maxCapacity !== "number" ||
    fields.maxCapacity !== 120
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

app.get("/api/health", (_request, response) => {
  response.json({ status: "ok" });
});

app.get("/api/events/christmas", async (_request, response, next) => {
  try {
    response.set("Cache-Control", "no-store");
    const event = await getChristmasEvent();
    await ensureChristmasEventState(event);
    await mongooseReady;
    const registrationState = await EventModel.findById("christmas").lean();
    const soldCount = registrationState?.soldCount ?? 0;
    const activeTier =
      soldCount < 25
        ? { name: "Early Bird", price: 18, remaining: 25 - soldCount }
        : soldCount < 75
          ? { name: "Regular", price: 22, remaining: 75 - soldCount }
          : soldCount < 120
            ? { name: "Late", price: 26, remaining: 120 - soldCount }
            : null;
    response.json({
      ...event,
      maxCapacity: 120,
      soldCount,
      totalRegistered: soldCount,
      isSoldOut: soldCount >= 120,
      activeTier,
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/tickets/:ticketCode", async (request, response, next) => {
  const ticketCode = request.params.ticketCode?.trim().toUpperCase();
  if (!ticketCode || !/^[A-Z0-9]{8}$/.test(ticketCode)) {
    response.status(404).json({ error: "Ticket not found." });
    return;
  }

  try {
    await mongooseReady;
    await ensureChristmasEventState(await getChristmasEvent());
    const ticket = await TicketModel.findOne({ ticketCode, isPaid: true }).lean();
    if (!ticket) {
      response.status(404).json({ error: "Ticket not found." });
      return;
    }

    const event = await getChristmasEvent();
    response.set("Cache-Control", "no-store");
    response.json({
      event: {
        title: event.title,
        date: event.date,
        time: event.time,
        location: event.location,
        posterUrl: event.posterUrl,
        partyDescription: event.partyDescription,
      },
      ticket: {
        code: ticket.ticketCode,
        tier: ticket.ticketTier,
        amountPaidCents: ticket.amountPaidCents,
        ticketNumber: ticket.ticketNumber,
      },
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/events/christmas/checkout", async (request, response, next) => {
  if (!requireSameOrigin(request, response)) return;
  await createCheckoutSession(request, response, next);
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

    const event = await getChristmasEvent();
    await ensureChristmasEventState(event);
    const soldCount = (await EventModel.findById("christmas").select("soldCount").lean())
      ?.soldCount ?? 0;
    response.set("Cache-Control", "no-store");
    response.json({
      ...event,
      maxCapacity: 120,
      soldCount,
      totalRegistered: soldCount,
    });
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
        ticketNumber: ticket.ticketNumber,
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
    response.json({ deletedCount: await clearUnpaidLegacyTickets() });
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
    await ensureChristmasEventState(await getChristmasEvent());
    const ticket = await TicketModel.findOneAndUpdate(
      { ticketCode, isPaid: true, isCheckedIn: false },
      { $set: { isCheckedIn: true, checkedInAt: new Date() } },
      { new: true },
    );
    if (!ticket) {
      const existingTicket = await TicketModel.findOne({ ticketCode }).lean();
      if (existingTicket?.isPaid && existingTicket.isCheckedIn) {
        response.status(409).json({
          error: "Ticket already scanned",
          checkedInAt: existingTicket.checkedInAt,
        });
      }
      else {
        response.status(existingTicket ? 400 : 404).json({
          error: existingTicket ? "Ticket has not been paid." : "Ticket not found.",
        });
      }
      return;
    }
    response.json({
      name: ticket.name,
      tier: ticket.ticketTier,
      ticketNumber: ticket.ticketNumber,
      message: "Entry authorized",
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

    const currentEvent = await getChristmasEvent();
    await ensureChristmasEventState(currentEvent);
    const soldCount = (await EventModel.findById("christmas").select("soldCount").lean())
      ?.soldCount ?? 0;
    const fields: EditableEvent = {
      title: request.body.title,
      description: request.body.description,
      date: request.body.date,
      time: request.body.time,
      location: request.body.location,
      posterUrl: request.body.posterUrl,
      ticketInfo: request.body.ticketInfo,
      partyDescription: request.body.partyDescription,
      maxCapacity: 120,
      totalRegistered: soldCount,
    };

    const savedEvent = await saveChristmasEvent(fields);
    await ensureChristmasEventState(savedEvent);
    response.json({ ...savedEvent, soldCount });
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

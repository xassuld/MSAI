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
import {
  ensureEventRegistrationState,
  registerAttendee,
} from "./ticketing.js";
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

function ticketPricingAreValid(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;

  const tiers = value as Record<string, unknown>;
  const prices = { earlyBird: 18, regular: 22, late: 26 } as const;
  return (["earlyBird", "regular", "late"] as const).every((name) => {
    const tier = tiers[name];
    if (typeof tier !== "object" || tier === null) return false;

    const fields = tier as Record<string, unknown>;
    return (
      typeof fields.price === "number" &&
      Number.isFinite(fields.price) &&
      fields.price === prices[name] &&
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
    const event = await getChristmasEvent();
    await ensureEventRegistrationState(event);
    await mongooseReady;
    const registrationState = await EventModel.findById("christmas").lean();
    const totalRegistered = registrationState?.totalRegistered ?? 0;
    const activeTier =
      totalRegistered < 25
        ? { key: "earlyBird", price: 18, spotsRemaining: 25 - totalRegistered }
        : totalRegistered < 75
          ? { key: "regular", price: 22, spotsRemaining: 75 - totalRegistered }
          : totalRegistered < 120
            ? { key: "late", price: 26, spotsRemaining: 120 - totalRegistered }
            : null;
    response.json({
      ...event,
      maxCapacity: 120,
      totalRegistered,
      isSoldOut: totalRegistered >= 120,
      activeTier,
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/events/christmas/registrations", async (request, response, next) => {
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
    await ensureEventRegistrationState(event);
    await mongooseReady;

    const existingTicket = await TicketModel.findOne({ email });
    if (existingTicket) {
      await sendAdmissionTicket(
        email,
        existingTicket.name,
        existingTicket.ticketCode,
        existingTicket.ticketTier,
        event,
        existingTicket.gatePrice,
      );
      await TicketModel.updateOne(
        { ticketCode: existingTicket.ticketCode },
        { $set: { emailSentAt: new Date() } },
      );
      response.json({
        message: "Registration email resent",
        ticket: {
          ticketCode: existingTicket.ticketCode,
          registrationNumber: existingTicket.registrationNumber,
          ticketTier: existingTicket.ticketTier,
          gatePrice: existingTicket.gatePrice,
        },
      });
      return;
    }

    const registration = await registerAttendee(name, email);
    if (!registration) {
      response.status(409).json({
        error: "Event is completely sold out (120/120 capacity reached).",
      });
      return;
    }
    const ticket = registration.ticket;

    if (registration.wasExisting) {
      await sendAdmissionTicket(
        email,
        ticket.name,
        ticket.ticketCode,
        ticket.ticketTier,
        event,
        ticket.gatePrice,
      );
      await TicketModel.updateOne(
        { ticketCode: ticket.ticketCode },
        { $set: { emailSentAt: new Date() } },
      );
      response.status(200).json({
        message: "Registration email resent",
        ticket: {
          ticketCode: ticket.ticketCode,
          registrationNumber: ticket.registrationNumber,
          ticketTier: ticket.ticketTier,
          gatePrice: ticket.gatePrice,
        },
      });
      return;
    }

    try {
      await sendAdmissionTicket(
        email,
        name,
        ticket.ticketCode,
        ticket.ticketTier,
        event,
        ticket.gatePrice,
      );
      await TicketModel.updateOne(
        { ticketCode: ticket.ticketCode },
        { $set: { emailSentAt: new Date() } },
      );
    } catch (error) {
      console.error(
        "Admission ticket email failed.",
        error instanceof Error ? `${error.name}: ${error.message}` : "Unknown error",
      );
    }

    response.status(201).json({
      message: "Registration confirmed",
      ticket: {
        ticketCode: ticket.ticketCode,
        registrationNumber: ticket.registrationNumber,
        ticketTier: ticket.ticketTier,
        gatePrice: ticket.gatePrice,
      },
    });
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
      { ticketCode, isCheckedIn: false },
      { $set: { isCheckedIn: true, isPaid: true, checkedInAt: new Date() } },
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
      gatePrice: ticket.gatePrice,
      message: `Entry approved. Collect €${ticket.gatePrice} cash.`,
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

    const currentEvent = await getChristmasEvent();
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
      maxCapacity: 120,
      totalRegistered: currentEvent.totalRegistered,
    };

    const savedEvent = await saveChristmasEvent(fields);
    await ensureEventRegistrationState(savedEvent);
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

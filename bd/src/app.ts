import { createHash, timingSafeEqual } from "node:crypto";
import cors from "cors";
import { v2 as cloudinary } from "cloudinary";
import mongoose from "mongoose";
import QRCode from "qrcode";
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
import {
  ensureChristmasEventState,
  generateTicketCode,
  getTicketPrices,
  resolveTicketTier,
} from "./ticketing.js";
import {
  createCheckoutSession,
  handleStripeWebhook,
} from "./ticketing-controller.js";
import { mongooseReady } from "./mongoose.js";
import { EventModel, TicketModel, type TicketDocument } from "./models.js";
import { sendAdmissionTicket } from "./ticket-email.js";

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

async function deliverComplimentaryTicket(ticket: TicketDocument): Promise<void> {
  if (!ticket.email) {
    throw new Error("Complimentary ticket has no recipient email.");
  }
  const event = await getChristmasEvent();
  await sendAdmissionTicket(
    ticket.email,
    ticket.name,
    ticket.ticketCode,
    ticket.ticketTier,
    event,
    0,
    true,
  );
  await TicketModel.updateOne(
    {
      ticketCode: ticket.ticketCode,
      isComplimentary: true,
      emailSentAt: { $exists: false },
    },
    { $set: { emailSentAt: new Date() } },
  );
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
    const registrationState = await EventModel.findById("christmas")
      .select("soldCount onlineSoldCount gateSaleCount ticketCount ticketPrices")
      .lean();
    const soldCount = registrationState?.soldCount ?? 0;
    const onlineSoldCount = registrationState?.onlineSoldCount ?? 0;
    const gateSaleCount = registrationState?.gateSaleCount ?? 0;
    const ticketCount = registrationState?.ticketCount ?? 0;
    const ticketPrices = getTicketPrices(registrationState?.ticketPrices);
    const activeTier =
      onlineSoldCount < 20
        ? { name: "Early Bird", price: ticketPrices.earlyBird / 100, remaining: 20 - onlineSoldCount }
        : onlineSoldCount < 75
          ? { name: "Regular", price: ticketPrices.regular / 100, remaining: 75 - onlineSoldCount }
          : onlineSoldCount < 100
            ? { name: "Late", price: ticketPrices.late / 100, remaining: 100 - onlineSoldCount }
            : null;
    response.json({
      ...event,
      maxCapacity: 120,
      soldCount,
      totalRegistered: ticketCount,
      isSoldOut: onlineSoldCount >= 100 || soldCount >= 120,
      gateTicketsRemaining: Math.max(0, Math.min(20 - gateSaleCount, 120 - soldCount)),
      onlineTicketsRemaining: Math.max(0, Math.min(100 - onlineSoldCount, 120 - soldCount)),
      ticketPrices,
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
    const ticket = await TicketModel.findOne({
      ticketCode,
      $or: [{ isPaid: true }, { isComplimentary: true }],
    }).lean();
    if (!ticket) {
      response.status(404).json({ error: "Ticket not found." });
      return;
    }

    const event = await getChristmasEvent();
    const frontendUrl = process.env.FRONTEND_URL;
    if (!frontendUrl) throw new Error("FRONTEND_URL is required.");
    const ticketUrl = `${frontendUrl.replace(/\/+$/, "")}/tickets/${encodeURIComponent(ticket.ticketCode)}`;
    const qrCodeDataUrl = await QRCode.toDataURL(ticketUrl, {
      errorCorrectionLevel: "M",
      margin: 2,
      width: 280,
      color: { dark: "#15294b", light: "#ffffff" },
    });
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
        isComplimentary: ticket.isComplimentary ?? false,
        isGateSale: ticket.paymentMethod === "cash",
        qrCodeDataUrl,
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
    const registrationState = await EventModel.findById("christmas")
      .select("soldCount onlineSoldCount gateSaleCount ticketCount ticketPrices")
      .lean();
    const soldCount = registrationState?.soldCount ?? 0;
    response.set("Cache-Control", "no-store");
    response.json({
      ...event,
      maxCapacity: 120,
      soldCount,
      totalRegistered: registrationState?.ticketCount ?? 0,
      ticketPrices: getTicketPrices(registrationState?.ticketPrices),
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
        email: ticket.email ?? null,
        ticketTier: ticket.ticketTier ?? null,
        ticketNumber: ticket.ticketNumber,
        isSandbox: ticket.isSandbox,
        emailSentAt: ticket.emailSentAt?.toISOString() ?? null,
      })),
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/tickets/complimentary", async (request, response, next) => {
  if (!requireSameOrigin(request, response)) return;

  try {
    const adminSession = await getAdminSession(request, response);
    if (!adminSession.isAdmin) {
      response.status(401).json({ error: "Admin login required." });
      return;
    }

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
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) {
      response.status(400).json({ error: "Enter a valid name and email address." });
      return;
    }

    await mongooseReady;
    await ensureChristmasEventState(await getChristmasEvent());
    const mongoSession = await mongoose.startSession();
    let ticket: TicketDocument | undefined;
    try {
      await mongoSession.withTransaction(async () => {
        const updatedEvent = await EventModel.findOneAndUpdate(
          { _id: "christmas" },
          { $inc: { ticketCount: 1 } },
          { new: true, session: mongoSession },
        );
        if (!updatedEvent) throw new Error("Christmas event state was not initialized.");

        const tier = resolveTicketTier(updatedEvent.soldCount);
        [ticket] = await TicketModel.create(
          [
            {
              name,
              email,
              ticketCode: generateTicketCode(),
              ticketNumber: updatedEvent.ticketCount,
              ticketTier: tier.key,
              amountPaidCents: 0,
              currency: "eur",
              paymentMethod: "complimentary",
              isPaid: false,
              isComplimentary: true,
            },
          ],
          { session: mongoSession },
        );
      });
    } finally {
      await mongoSession.endSession();
    }

    if (!ticket) {
      throw new Error("Complimentary ticket transaction completed without creating a ticket.");
    }

    try {
      await deliverComplimentaryTicket(ticket);
    } catch (error) {
      console.error("Complimentary ticket was created but email delivery failed.", {
        ticketNumber: ticket.ticketNumber,
        error,
      });
      response.status(502).json({
        error: "Ticket created, but email delivery failed. Retry the email from the ticket list.",
        ticket: {
          name: ticket.name,
          email: ticket.email,
          ticketNumber: ticket.ticketNumber,
          ticketTier: ticket.ticketTier,
          isComplimentary: true,
          isSandbox: false,
          isGateSale: false,
          emailSentAt: null,
        },
      });
      return;
    }

    response.status(201).json({
      ticket: {
        name: ticket.name,
        email: ticket.email,
        ticketNumber: ticket.ticketNumber,
        ticketTier: ticket.ticketTier,
        isComplimentary: true,
        isSandbox: false,
        isGateSale: false,
        emailSentAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/tickets/gate", async (request, response, next) => {
  if (!requireSameOrigin(request, response)) return;

  try {
    const adminSession = await getAdminSession(request, response);
    if (!adminSession.isAdmin) {
      response.status(401).json({ error: "Admin login required." });
      return;
    }

    const name =
      typeof request.body?.name === "string"
        ? request.body.name.trim().replace(/\s+/g, " ")
        : "";
    if (!name || name.length > 120 || /[\u0000-\u001f\u007f]/.test(name)) {
      response.status(400).json({ error: "Enter a valid attendee name." });
      return;
    }

    await mongooseReady;
    await ensureChristmasEventState(await getChristmasEvent());
    const mongoSession = await mongoose.startSession();
    let ticket: TicketDocument | undefined;
    let soldOut = false;
    try {
      await mongoSession.withTransaction(async () => {
        const updatedEvent = await EventModel.findOneAndUpdate(
          {
            _id: "christmas",
            soldCount: { $lt: 120 },
            gateSaleCount: { $lt: 20 },
          },
          { $inc: { soldCount: 1, gateSaleCount: 1, ticketCount: 1 } },
          { new: true, session: mongoSession },
        );
        if (!updatedEvent) {
          const currentEvent = await EventModel.findById("christmas")
            .select("soldCount gateSaleCount ticketPrices")
            .session(mongoSession)
            .lean();
          soldOut =
            (currentEvent?.soldCount ?? 0) >= 120 ||
            (currentEvent?.gateSaleCount ?? 0) >= 20;
          return;
        }

        const checkedInAt = new Date();
        [ticket] = await TicketModel.create(
          [
            {
              name,
              ticketCode: generateTicketCode(),
              ticketNumber: updatedEvent.ticketCount,
              ticketTier: "atGate",
              amountPaidCents: getTicketPrices(updatedEvent.ticketPrices).atGate,
              currency: "eur",
              paymentMethod: "cash",
              isPaid: true,
              isCheckedIn: true,
              checkedInAt,
            },
          ],
          { session: mongoSession },
        );
      });
    } finally {
      await mongoSession.endSession();
    }

    if (soldOut) {
      response.status(409).json({ error: "All available At-gate tickets have been issued." });
      return;
    }
    if (!ticket) {
      throw new Error("Gate ticket transaction completed without creating a ticket.");
    }

    response.status(201).json({
      ticket: {
        name: ticket.name,
        email: null,
        ticketNumber: ticket.ticketNumber,
        ticketTier: ticket.ticketTier,
        amountPaidCents: ticket.amountPaidCents,
        isComplimentary: false,
        isSandbox: false,
        isGateSale: true,
        emailSentAt: null,
        isCheckedIn: true,
      },
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/tickets/:ticketNumber/resend", async (request, response, next) => {
  if (!requireSameOrigin(request, response)) return;

  try {
    const adminSession = await getAdminSession(request, response);
    if (!adminSession.isAdmin) {
      response.status(401).json({ error: "Admin login required." });
      return;
    }

    const ticketNumber = Number(request.params.ticketNumber);
    if (!Number.isSafeInteger(ticketNumber) || ticketNumber < 1) {
      response.status(400).json({ error: "Enter a valid ticket number." });
      return;
    }

    await mongooseReady;
    const ticket = await TicketModel.findOne({
      ticketNumber,
      isComplimentary: true,
      emailSentAt: { $exists: false },
    });
    if (!ticket) {
      response.status(404).json({ error: "Unsent complimentary ticket not found." });
      return;
    }

    try {
      await deliverComplimentaryTicket(ticket);
    } catch (error) {
      console.error("Could not resend complimentary ticket email.", {
        ticketNumber,
        error,
      });
      response.status(502).json({ error: "Could not send the ticket email. Please try again." });
      return;
    }

    response.json({ emailSentAt: new Date().toISOString() });
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

app.delete("/api/admin/tickets/:ticketNumber", async (request, response, next) => {
  if (!requireSameOrigin(request, response)) return;

  try {
    const adminSession = await getAdminSession(request, response);
    if (!adminSession.isAdmin) {
      response.status(401).json({ error: "Admin login required." });
      return;
    }

    const ticketNumber = Number(request.params.ticketNumber);
    if (!Number.isSafeInteger(ticketNumber) || ticketNumber < 1) {
      response.status(400).json({ error: "Enter a valid ticket number." });
      return;
    }

    await mongooseReady;
    await ensureChristmasEventState(await getChristmasEvent());
    const mongoSession = await mongoose.startSession();
    const outcome: {
      result: "deleted" | "notFound" | "notEligible" | "capacityOutOfSync";
    } = { result: "notFound" };

    try {
      await mongoSession.withTransaction(async () => {
        const ticket = await TicketModel.findOne({ ticketNumber }).session(mongoSession);
        if (!ticket) {
          outcome.result = "notFound";
          return;
        }
        if (!ticket.isPaid && !ticket.isComplimentary) {
          outcome.result = "notEligible";
          return;
        }

        if (ticket.isPaid) {
          const ticketCounterUpdate =
            ticket.paymentMethod === "cash"
              ? { soldCount: -1, gateSaleCount: -1 }
              : { soldCount: -1, onlineSoldCount: -1 };
          const event = await EventModel.findOneAndUpdate(
            {
              _id: "christmas",
              soldCount: { $gt: 0 },
              ...(ticket.paymentMethod === "cash"
                ? { gateSaleCount: { $gt: 0 } }
                : { onlineSoldCount: { $gt: 0 } }),
            },
            { $inc: ticketCounterUpdate },
            { new: true, session: mongoSession },
          );
          if (!event) {
            outcome.result = "capacityOutOfSync";
            return;
          }
        }

        const deletion = await TicketModel.deleteOne(
          { _id: ticket._id },
          { session: mongoSession },
        );
        if (deletion.deletedCount !== 1) {
          throw new Error("Test or complimentary ticket could not be deleted.");
        }
        outcome.result = "deleted";
      });
    } finally {
      await mongoSession.endSession();
    }

    if (outcome.result === "deleted") {
      response.json({ deleted: true, ticketNumber });
    } else if (outcome.result === "notFound") {
      response.status(404).json({ error: "Ticket not found." });
    } else if (outcome.result === "notEligible") {
      response.status(409).json({
        error: "This ticket is not an admission ticket and cannot be deleted here.",
      });
    } else if (outcome.result === "capacityOutOfSync") {
      response.status(409).json({
        error: "Paid ticket capacity is out of sync. The ticket was not deleted.",
      });
    } else {
      response.status(409).json({ error: "This ticket cannot be deleted." });
    }
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
      {
        ticketCode,
        isCheckedIn: false,
        $or: [{ isPaid: true }, { isComplimentary: true }],
      },
      { $set: { isCheckedIn: true, checkedInAt: new Date() } },
      { new: true },
    );
    if (!ticket) {
      const existingTicket = await TicketModel.findOne({ ticketCode }).lean();
      if (
        (existingTicket?.isPaid || existingTicket?.isComplimentary) &&
        existingTicket.isCheckedIn
      ) {
        response.status(409).json({
          error: "Ticket already scanned",
          checkedInAt: existingTicket.checkedInAt,
        });
      }
      else {
        response.status(existingTicket ? 400 : 404).json({
          error: existingTicket
            ? "Ticket is not eligible for entry."
            : "Ticket not found.",
        });
      }
      return;
    }
    response.json({
      name: ticket.name,
      tier: ticket.isComplimentary ? "Complimentary" : ticket.ticketTier,
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

app.put("/api/admin/ticket-prices", async (request, response, next) => {
  if (!requireSameOrigin(request, response)) return;

  try {
    const session = await getAdminSession(request, response);
    if (!session.isAdmin) {
      response.status(401).json({ error: "Admin login required." });
      return;
    }

    const prices = request.body?.ticketPrices;
    const priceKeys = ["earlyBird", "regular", "late", "atGate"] as const;
    if (
      !prices ||
      typeof prices !== "object" ||
      priceKeys.some(
        (key) =>
          !Number.isSafeInteger(prices[key]) ||
          prices[key] < 1 ||
          prices[key] > 1000000,
      )
    ) {
      response.status(400).json({
        error: "Enter prices from €0.01 to €10,000.00 for every ticket type.",
      });
      return;
    }

    const currentEvent = await getChristmasEvent();
    await ensureChristmasEventState(currentEvent);
    const updatedEvent = await EventModel.findOneAndUpdate(
      { _id: "christmas" },
      {
        $set: {
          ticketPrices: {
            earlyBird: prices.earlyBird,
            regular: prices.regular,
            late: prices.late,
            atGate: prices.atGate,
          },
        },
      },
      { new: true },
    )
      .select("ticketPrices")
      .lean();

    response.set("Cache-Control", "no-store");
    response.json({ ticketPrices: getTicketPrices(updatedEvent?.ticketPrices) });
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

import { createHash, timingSafeEqual } from "node:crypto";
import cors from "cors";
import { v2 as cloudinary } from "cloudinary";
import express, {
  type ErrorRequestHandler,
  type Request,
  type Response,
} from "express";
import { getAllowedOrigins } from "./env.js";
import {
  getChristmasEvent,
  getLoginRetryAfter,
  recordFailedLogin,
  saveChristmasEvent,
  type EditableEvent,
} from "./event-data.js";
import { getAdminSession } from "./admin-session.js";

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

  if (!origin) return false;

  try {
    return isAllowedOrigin(origin);
  } catch {
    return false;
  }
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
    !(fields.title as string).trim()
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
    response.json(await getChristmasEvent());
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
    };

    response.json(await saveChristmasEvent(fields));
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

app.use(((error, _request, response, _next) => {
  void _next;
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

  if (response.headersSent) return;
  response.status(status).json({
    error:
      status === 413
        ? "Request body is too large."
        : status >= 500
          ? "The backend could not complete the request."
          : "The request could not be processed.",
  });
}) satisfies ErrorRequestHandler);

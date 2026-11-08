import dotenv from "dotenv";
import { fileURLToPath } from "node:url";

dotenv.config({
  path: [
    fileURLToPath(new URL("../.env.local", import.meta.url)),
    fileURLToPath(new URL("../.env", import.meta.url)),
  ],
});

const requiredVariables = [
  "MONGODB_URI",
  "CLOUDINARY_CLOUD_NAME",
  "CLOUDINARY_API_KEY",
  "CLOUDINARY_API_SECRET",
  "ADMIN_PASSWORD",
  "ADMIN_SESSION_SECRET",
  "FRONTEND_URL",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
] as const;

export function validateEnvironment(): void {
  const missing = requiredVariables.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(`Missing required backend environment variables: ${missing.join(", ")}`);
  }

  if ((process.env.ADMIN_SESSION_SECRET?.length ?? 0) < 32) {
    throw new Error("ADMIN_SESSION_SECRET must be at least 32 characters.");
  }
}

export function getAllowedOrigins(): string[] {
  const configured = process.env.FRONTEND_ORIGINS;
  const origins = configured
    ? configured.split(",").map((origin) => origin.trim()).filter(Boolean)
    : ["http://localhost:3000", "http://localhost:3001"];

  return [...new Set(origins.map((origin) => new URL(origin).origin))];
}

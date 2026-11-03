import { getIronSession, type IronSession, type SessionOptions } from "iron-session";
import type { Request, Response } from "express";

export type AdminSessionData = {
  isAdmin?: boolean;
};

const sessionOptions: SessionOptions = {
  cookieName: "msai-admin-session",
  password: process.env.ADMIN_SESSION_SECRET!,
  cookieOptions: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    path: "/",
    maxAge: 60 * 60 * 8,
  },
};

export function getAdminSession(
  request: Request,
  response: Response,
): Promise<IronSession<AdminSessionData>> {
  return getIronSession<AdminSessionData>(request, response, sessionOptions);
}

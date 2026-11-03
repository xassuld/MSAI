import { randomUUID } from "node:crypto";
import type { EventData } from "./event-data.js";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character]!;
  });
}

function encodeBase64(value: string): string {
  return Buffer.from(value, "utf8").toString("base64").replace(/.{1,76}/g, "$&\r\n").trim();
}

export async function sendAdmissionTicket(
  recipient: string,
  attendeeName: string,
  ticketCode: string,
  event: EventData,
): Promise<void> {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN;
  const sender = process.env.GMAIL_USER;
  if (!clientId || !clientSecret || !refreshToken || !sender) {
    throw new Error(
      "GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN, and GMAIL_USER must be configured.",
    );
  }
  if (!/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(sender)) {
    throw new Error("GMAIL_USER must be a valid email address.");
  }

  const date = event.date
    ? new Intl.DateTimeFormat("en", {
        dateStyle: "long",
        timeZone: "UTC",
      }).format(new Date(`${event.date}T12:00:00Z`))
    : "To be announced";
  const time = event.time || "To be announced";
  const location = event.location || "To be announced";
  const safeName = escapeHtml(attendeeName);
  const safeTitle = escapeHtml(event.title);
  const safeDate = escapeHtml(date);
  const safeTime = escapeHtml(time);
  const safeLocation = escapeHtml(location);
  const safeTicketCode = escapeHtml(ticketCode);

  const boundary = `msai_${randomUUID().replace(/-/g, "")}`;
  const plainText = [
    `Hello ${attendeeName},`,
    "",
    `Your admission ticket for ${event.title} is confirmed.`,
    `Ticket code: ${ticketCode}`,
    `Date: ${date}`,
    `Time: ${time}`,
    `Location: ${location}`,
    "",
    "Please show this email or your ticket code at the event.",
    "Mongolian Students' Association in Italy",
  ].join("\n");
  const html = `<!doctype html>
<html lang="en">
  <body style="margin:0;background:#f3ecdf;padding:32px 16px;font-family:Arial,sans-serif;color:#15294b">
    <main style="box-sizing:border-box;max-width:560px;margin:0 auto;border:1px solid #c7b995;border-radius:20px;background:#fffdf8;padding:32px">
      <p style="margin:0;color:#80643a;font-size:12px;font-weight:bold;letter-spacing:2px;text-transform:uppercase">Mongolian Students' Association in Italy</p>
      <h1 style="margin:24px 0 8px;font-family:Georgia,serif;font-size:32px">${safeTitle}</h1>
      <p>Hello ${safeName}, your admission is confirmed.</p>
      <div style="margin:24px 0;padding:20px;border:1px dashed #80643a;border-radius:12px">
        <p style="margin:0 0 8px;font-size:12px;font-weight:bold;letter-spacing:1px;text-transform:uppercase">Admission ticket</p>
        <p style="margin:0 0 18px;font-family:monospace;font-size:22px;font-weight:bold">${safeTicketCode}</p>
        <p style="margin:6px 0"><strong>Date:</strong> ${safeDate}</p>
        <p style="margin:6px 0"><strong>Time:</strong> ${safeTime}</p>
        <p style="margin:6px 0"><strong>Location:</strong> ${safeLocation}</p>
      </div>
      <p style="font-size:14px;line-height:1.6">Please show this email or your ticket code at the event.</p>
    </main>
  </body>
</html>`;
  const mimeMessage = [
    `From: MSAI Events <${sender}>`,
    `To: ${recipient}`,
    "Subject: Your admission ticket for the MSAI Christmas event",
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    encodeBase64(plainText),
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    encodeBase64(html),
    `--${boundary}--`,
  ].join("\r\n");
  const raw = Buffer.from(mimeMessage, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    signal: AbortSignal.timeout(10_000),
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!tokenResponse.ok) {
    const responseBody = await tokenResponse.text();
    throw new Error(
      `Google OAuth token request failed (${tokenResponse.status}): ${responseBody.slice(0, 300)}`,
    );
  }

  const tokenData: unknown = await tokenResponse.json();
  if (
    typeof tokenData !== "object" ||
    tokenData === null ||
    !("access_token" in tokenData) ||
    typeof tokenData.access_token !== "string"
  ) {
    throw new Error("Google OAuth response did not include an access token.");
  }

  const sendResponse = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(15_000),
      body: JSON.stringify({ raw }),
    },
  );

  if (!sendResponse.ok) {
    const responseBody = await sendResponse.text();
    throw new Error(
      `Gmail API request failed (${sendResponse.status}): ${responseBody.slice(0, 300)}`,
    );
  }
}

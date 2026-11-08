import { randomUUID } from "node:crypto";
import QRCode from "qrcode";
import type { EventData, TicketTierName } from "./event-data.js";

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

function wrapBase64(value: string): string {
  return value.replace(/.{1,76}/g, "$&\r\n").trim();
}

function encodeBase64(value: string): string {
  return wrapBase64(Buffer.from(value, "utf8").toString("base64"));
}

export async function sendAdmissionTicket(
  recipient: string,
  attendeeName: string,
  ticketCode: string,
  ticketTier: TicketTierName,
  event: EventData,
  amountPaidCents = event.ticketPricing[ticketTier].price * 100,
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
  if (!/^[^\s<>,;:"()[\]\\]+@[^\s<>,;:"()[\]\\]+\.[^\s<>,;:"()[\]\\]+$/.test(sender)) {
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
  const tierLabels: Record<TicketTierName, string> = {
    earlyBird: "Early Bird",
    regular: "Regular",
    late: "Late",
  };
  const ticketType = tierLabels[ticketTier];
  const ticketPrice = (amountPaidCents / 100).toFixed(2);
  const safeTicketType = escapeHtml(ticketType);
  const safePosterUrl = event.posterUrl ? escapeHtml(event.posterUrl) : "";
  const safePartyDescription = escapeHtml(event.partyDescription);
  const safeCashAtGateText = escapeHtml(event.cashAtGateText);
  const eventUrl = "https://msai-eight.vercel.app/events/christmas";
  const qrCode = await QRCode.toBuffer(ticketCode, {
    errorCorrectionLevel: "M",
    margin: 2,
    width: 280,
    color: { dark: "#15294b", light: "#ffffff" },
  });

  const plainText = [
    `Hello ${attendeeName},`,
    "",
    `Your admission ticket for ${event.title} is confirmed.`,
    `Ticket code: ${ticketCode}`,
    `Ticket type: ${ticketType} (€${ticketPrice}, paid online by card)`,
    `Date: ${date}`,
    `Time: ${time}`,
    `Location: ${location}`,
    "",
    event.partyDescription,
    event.cashAtGateText,
    "",
    `Event page: ${eventUrl}`,
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
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;border:1px solid #c7b995;border-radius:12px;border-collapse:separate;background:#fffdf8">
        <tr>
          <td colspan="2" style="padding:10px 16px;background:#15294b;border-radius:11px 11px 0 0">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="color:#fffdf8;font-size:11px;font-weight:bold;letter-spacing:2px">ADMISSION TICKET</td>
                <td align="right" style="color:#e4c77e;font-size:10px;font-weight:bold;letter-spacing:1px">MSAI · EVENT PASS</td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td width="48%" valign="middle" style="padding:16px">
            <p style="margin:0 0 5px;color:#80643a;font-size:9px;font-weight:bold;letter-spacing:1.5px;text-transform:uppercase">Christmas gathering</p>
            <p style="margin:0 0 12px;font-family:Georgia,serif;font-size:18px;font-weight:bold;line-height:1.2">${safeTitle}</p>
            <p style="margin:0 0 12px;font-family:monospace;font-size:17px;font-weight:bold;letter-spacing:.5px;overflow-wrap:anywhere">${safeTicketCode}</p>
            <p style="margin:6px 0;font-size:12px;line-height:1.4"><strong style="color:#80643a;font-size:10px;letter-spacing:.5px">TICKET TYPE</strong><br>${safeTicketType} · €${ticketPrice} paid online</p>
            <p style="margin:6px 0;font-size:12px;line-height:1.4"><strong style="color:#80643a;font-size:10px;letter-spacing:.5px">DATE</strong><br>${safeDate}</p>
            <p style="margin:6px 0;font-size:12px;line-height:1.4"><strong style="color:#80643a;font-size:10px;letter-spacing:.5px">TIME</strong><br>${safeTime}</p>
            <p style="margin:6px 0;font-size:12px;line-height:1.4;overflow-wrap:anywhere"><strong style="color:#80643a;font-size:10px;letter-spacing:.5px">LOCATION</strong><br>${safeLocation}</p>
            <p style="margin:14px 0 0;color:#80643a;font-size:8px;font-weight:bold;letter-spacing:1px">PRESENT THIS TICKET AT ENTRY</p>
          </td>
          <td width="52%" valign="middle" style="padding:12px 10px;border-left:1px dashed #c7b995;text-align:center">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
              <tr>
                <td valign="middle" style="padding:12px 8px;text-align:center">
                  ${
                    safePosterUrl
                      ? `<img src="${safePosterUrl}" alt="${safeTitle} event poster" width="220" style="display:block;width:100%;max-width:220px;height:auto;object-fit:contain;margin:0 auto;border-radius:4px">`
                      : `<div style="box-sizing:border-box;width:100%;max-width:220px;height:310px;margin:0 auto;padding:10px 4px;border:1px solid #c7b995;background:#f3ecdf;font-family:Georgia,serif;font-size:11px">${safeTitle}</div>`
                  }
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
      <p style="font-size:14px;line-height:1.6">Please show this email or your ticket code at the event.</p>
      <p style="font-size:14px;line-height:1.6"><strong>What&apos;s included:</strong> ${safePartyDescription}</p>
      <p style="margin:18px 0;padding:14px;border:2px solid #923a35;border-radius:10px;color:#923a35;font-size:14px;font-weight:bold;text-align:center">${safeCashAtGateText}</p>
      <p style="font-size:12px"><a href="${eventUrl}" style="color:#15294b">Open the event page</a></p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;border-top:1px solid #c7b995">
        <tr>
          <td valign="middle" style="padding:18px 8px 0;text-align:center">
            <p style="margin:0;color:#15294b;font-family:Georgia,serif;font-size:26px;font-weight:bold;line-height:1.2">SEE YOU THERE ❤️</p>
          </td>
          <td align="center" valign="middle" style="padding:18px 8px 0">
            <img src="cid:event-signup-qr" alt="QR code linking to the event page" width="96" height="96" style="display:block;width:96px;height:96px;margin:0 auto">
            <p style="margin:6px 0 0;color:#80643a;font-size:10px;font-weight:bold;letter-spacing:1px">EVENT INFO</p>
          </td>
        </tr>
      </table>
    </main>
  </body>
</html>`;
  const relatedBoundary = `msai_related_${randomUUID().replace(/-/g, "")}`;
  const alternativeBoundary = `msai_alternative_${randomUUID().replace(/-/g, "")}`;
  const mimeMessage = [
    `From: MSAI Events <${sender}>`,
    `To: ${recipient}`,
    "Subject: Your admission ticket for the MSAI Christmas event",
    "MIME-Version: 1.0",
    `Content-Type: multipart/related; boundary="${relatedBoundary}"`,
    "",
    `--${relatedBoundary}`,
    `Content-Type: multipart/alternative; boundary="${alternativeBoundary}"`,
    "",
    `--${alternativeBoundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    encodeBase64(plainText),
    `--${alternativeBoundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    encodeBase64(html),
    `--${alternativeBoundary}--`,
    `--${relatedBoundary}`,
    "Content-Type: image/png; name=event-signup-qr.png",
    "Content-Transfer-Encoding: base64",
    "Content-ID: <event-signup-qr>",
    'Content-Disposition: inline; filename="event-signup-qr.png"',
    "",
    wrapBase64(qrCode.toString("base64")),
    `--${relatedBoundary}--`,
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

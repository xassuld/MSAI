import nodemailer from "nodemailer";
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

export async function sendAdmissionTicket(
  recipient: string,
  attendeeName: string,
  ticketCode: string,
  event: EventData,
): Promise<void> {
  const gmailUser = process.env.GMAIL_USER;
  const gmailAppPassword = process.env.GMAIL_APP_PASSWORD?.replace(/\s/g, "");
  if (!gmailUser || !gmailAppPassword) {
    throw new Error("GMAIL_USER and GMAIL_APP_PASSWORD must be configured.");
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: gmailUser, pass: gmailAppPassword },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });
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

  try {
    await transporter.sendMail({
      from: { name: "MSAI Events", address: gmailUser },
      to: recipient,
      subject: "Your admission ticket for the MSAI Christmas event",
      text: [
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
      ].join("\n"),
      html: `<!doctype html>
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
</html>`,
    });
  } finally {
    transporter.close();
  }
}

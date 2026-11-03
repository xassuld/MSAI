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
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) {
    throw new Error("RESEND_API_KEY and RESEND_FROM_EMAIL must be configured.");
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

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    signal: AbortSignal.timeout(15_000),
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [recipient],
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
    }),
  });

  if (!response.ok) {
    const responseBody = await response.text();
    throw new Error(
      `Resend API request failed (${response.status}): ${responseBody.slice(0, 500)}`,
    );
  }
}

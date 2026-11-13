import { getChristmasEvent } from "./event-data.js";
import { TicketModel, type TicketDocument } from "./models.js";
import { sendAdmissionTicket } from "./ticket-email.js";

const emailDeliveryLeaseMs = 60_000;

export async function deliverAdmissionTicket(
  ticket: TicketDocument,
): Promise<"sent" | "alreadySent" | "sending"> {
  if (!ticket.email) {
    throw new Error("Admission ticket has no recipient email.");
  }

  const claimedAt = new Date();
  const leaseExpiredBefore = new Date(claimedAt.getTime() - emailDeliveryLeaseMs);
  const claimedTicket = await TicketModel.findOneAndUpdate(
    {
      ticketCode: ticket.ticketCode,
      emailSentAt: { $exists: false },
      $or: [
        { emailSendingAt: { $exists: false } },
        { emailSendingAt: { $lt: leaseExpiredBefore } },
      ],
    },
    { $set: { emailSendingAt: claimedAt } },
    { new: true },
  );

  if (!claimedTicket) {
    const currentTicket = await TicketModel.findOne({ ticketCode: ticket.ticketCode })
      .select("emailSentAt")
      .lean();
    return currentTicket?.emailSentAt ? "alreadySent" : "sending";
  }

  try {
    if (!claimedTicket.email) {
      throw new Error("Admission ticket has no recipient email.");
    }
    const event = await getChristmasEvent();
    await sendAdmissionTicket(
      claimedTicket.email,
      claimedTicket.name,
      claimedTicket.ticketCode,
      claimedTicket.ticketTier,
      event,
      claimedTicket.amountPaidCents,
      claimedTicket.isComplimentary,
    );
  } catch (error) {
    await TicketModel.updateOne(
      { ticketCode: claimedTicket.ticketCode, emailSendingAt: claimedAt },
      { $unset: { emailSendingAt: 1 } },
    );
    throw error;
  }

  const updated = await TicketModel.updateOne(
    {
      ticketCode: claimedTicket.ticketCode,
      emailSendingAt: claimedAt,
      emailSentAt: { $exists: false },
    },
    {
      $set: { emailSentAt: new Date() },
      $unset: { emailSendingAt: 1 },
    },
  );
  if (updated.modifiedCount !== 1) {
    throw new Error("Admission ticket email was sent but its delivery status was not saved.");
  }

  return "sent";
}

import { randomInt } from "node:crypto";
import { mongooseReady } from "./mongoose.js";
import { ensureTicketIndexes, EventModel, TicketModel } from "./models.js";
import type { EventData } from "./event-data.js";

export const ticketTiers = {
  earlyBird: { name: "Early Bird", price: 18, amountInCents: 1800, end: 25 },
  regular: { name: "Regular", price: 22, amountInCents: 2200, end: 75 },
  late: { name: "Late", price: 26, amountInCents: 2600, end: 120 },
} as const;

export type TicketTierName = keyof typeof ticketTiers;

export function resolveTicketTier(
  soldCount: number,
): { key: TicketTierName; name: string; price: number; amountInCents: number } {
  const key =
    soldCount < 25
      ? "earlyBird"
      : soldCount < 75
        ? "regular"
        : "late";
  return { key, ...ticketTiers[key] };
}

export function generateTicketCode(): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  return Array.from({ length: 8 }, () => alphabet[randomInt(alphabet.length)]).join("");
}

export async function ensureChristmasEventState(event: EventData): Promise<void> {
  await mongooseReady;
  await ensureTicketIndexes();
  await EventModel.updateOne(
    { _id: "christmas" },
    {
      $set: {
        title: event.title,
        maxCapacity: 120,
        tierCaps: { earlyBird: 25, regular: 50, late: 45 },
      },
      $setOnInsert: {
        soldCount: 0,
        ticketCount: 0,
        countersInitialized: true,
      },
    },
    { upsert: true },
  );

  const [paidTicketCount, latestTicket] = await Promise.all([
    TicketModel.countDocuments({ isPaid: true }),
    TicketModel.findOne({
      $or: [{ isPaid: true }, { isComplimentary: true }],
    })
      .sort({ ticketNumber: -1 })
      .select("ticketNumber")
      .lean(),
  ]);
  await EventModel.updateOne(
    { _id: "christmas", countersInitialized: { $ne: true } },
    {
      $set: {
        soldCount: paidTicketCount,
        ticketCount: latestTicket?.ticketNumber ?? 0,
        countersInitialized: true,
      },
    },
  );
}

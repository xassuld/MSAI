import { DateTime } from "luxon";
import mongoose from "mongoose";
import { randomBytes } from "node:crypto";
import Stripe from "stripe";
import { mongooseReady } from "./mongoose.js";
import { EventModel, TicketModel, type TicketDocument } from "./models.js";
import type { EventData, TicketTierName } from "./event-data.js";

export const ticketTiers = {
  earlyBird: {
    name: "Early Bird",
    priceCents: 1800,
    startsAt: "2026-11-09T00:00:00",
    endsAt: "2026-11-15T23:59:59.999",
  },
  regular: {
    name: "Regular",
    priceCents: 2200,
    startsAt: "2026-11-16T00:00:00",
    endsAt: "2026-12-06T23:59:59.999",
  },
  late: {
    name: "Late",
    priceCents: 2700,
    startsAt: "2026-12-07T00:00:00",
    endsAt: "2026-12-13T23:59:59.999",
  },
} as const satisfies Record<
  TicketTierName,
  { name: string; priceCents: number; startsAt: string; endsAt: string }
>;

export type ActiveTicketTier = (typeof ticketTiers)[TicketTierName] & {
  key: TicketTierName;
};

export function isTicketTierName(value: string | undefined): value is TicketTierName {
  return value !== undefined && value in ticketTiers;
}

export function resolveActiveTicketTier(
  now = DateTime.now().setZone("Europe/Rome"),
): ActiveTicketTier | null {
  for (const key of Object.keys(ticketTiers) as TicketTierName[]) {
    const tier = ticketTiers[key];
    const startsAt = DateTime.fromISO(tier.startsAt, { zone: "Europe/Rome" });
    const endsAt = DateTime.fromISO(tier.endsAt, { zone: "Europe/Rome" });
    if (now >= startsAt && now <= endsAt) return { ...tier, key };
  }
  return null;
}

export function generateTicketCode(): string {
  return randomBytes(6).toString("base64url").replace(/[-_]/g, "A").slice(0, 8).toUpperCase();
}

export async function ensureEventCapacity(event: EventData): Promise<void> {
  await mongooseReady;
  await EventModel.updateOne(
    { _id: "christmas" },
    {
      $set: { title: event.title, maxCapacity: event.maxCapacity },
      $setOnInsert: { soldCount: event.soldCount },
    },
    { upsert: true },
  );
  await EventModel.updateOne(
    { _id: "christmas", soldCount: { $exists: false } },
    { $set: { soldCount: event.soldCount } },
  );
}

export async function reservePaidTicket(
  name: string,
  email: string,
  tier: ActiveTicketTier,
  session: Stripe.Checkout.Session,
): Promise<TicketDocument> {
  await mongooseReady;
  const mongoSession = await mongoose.startSession();
  try {
    let ticket!: TicketDocument;
    await mongoSession.withTransaction(async () => {
      const event = await EventModel.findOneAndUpdate(
        {
          _id: "christmas",
          $expr: { $lt: ["$soldCount", "$maxCapacity"] },
        },
        { $inc: { soldCount: 1 } },
        { new: true, session: mongoSession },
      );
      if (!event) throw new Error("EVENT_CAPACITY_REACHED");

      ticket = await TicketModel.create(
        [
          {
            email,
            name,
            ticketCode: generateTicketCode(),
            ticketTier: tier.key,
            amountPaidCents: tier.priceCents,
            currency: "eur",
            stripeSessionId: session.id,
            stripePaymentIntentId:
              typeof session.payment_intent === "string"
                ? session.payment_intent
                : "",
            isPaid: true,
          },
        ],
        { session: mongoSession },
      ).then(([created]) => created!);
    });
    return ticket;
  } finally {
    await mongoSession.endSession();
  }
}

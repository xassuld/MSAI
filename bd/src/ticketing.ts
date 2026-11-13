import { randomInt } from "node:crypto";
import mongoose from "mongoose";
import { mongooseReady } from "./mongoose.js";
import { ensureTicketIndexes, EventModel, TicketModel } from "./models.js";
import { expirePaymentAuthorizations } from "./payment-authorizations.js";
import type { EventData } from "./event-data.js";

export const ticketTiers = {
  earlyBird: { name: "Early Bird", price: 15, amountInCents: 1500, end: 20 },
  regular: { name: "Regular", price: 25, amountInCents: 2500, end: 75 },
  late: { name: "Late", price: 28, amountInCents: 2800, end: 100 },
} as const;

export type TicketPrices = Record<keyof typeof ticketTiers | "atGate", number>;

export const defaultTicketPrices: TicketPrices = {
  earlyBird: 1500,
  regular: 2500,
  late: 2800,
  atGate: 2800,
};

export function getTicketPrices(value: Partial<TicketPrices> | null | undefined): TicketPrices {
  return {
    earlyBird: value?.earlyBird ?? defaultTicketPrices.earlyBird,
    regular: value?.regular ?? defaultTicketPrices.regular,
    late: value?.late ?? defaultTicketPrices.late,
    atGate: value?.atGate ?? defaultTicketPrices.atGate,
  };
}

export type TicketTierName = keyof typeof ticketTiers | "atGate" | "lateLate";

export function resolveTicketTier(
  soldCount: number,
  prices: TicketPrices = defaultTicketPrices,
): { key: TicketTierName; name: string; price: number; amountInCents: number } {
  const key: keyof typeof ticketTiers =
    soldCount < 20
      ? "earlyBird"
      : soldCount < 75
        ? "regular"
        : "late";
  return {
    ...ticketTiers[key],
    key,
    price: prices[key] / 100,
    amountInCents: prices[key],
  };
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
        tierCaps: { earlyBird: 20, regular: 55, late: 25, atGate: 20 },
      },
      $setOnInsert: {
        soldCount: 0,
        onlineSoldCount: 0,
        onlineReservedCount: 0,
        gateSaleCount: 0,
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
  const [onlinePaidTicketCount, gateSaleCount] = await Promise.all([
    TicketModel.countDocuments({
      isPaid: true,
      paymentMethod: { $ne: "cash" },
    }),
    TicketModel.countDocuments({ isPaid: true, paymentMethod: "cash" }),
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
  await Promise.all([
    EventModel.updateOne(
      { _id: "christmas", onlineSoldCount: { $exists: false } },
      { $set: { onlineSoldCount: onlinePaidTicketCount } },
    ),
    EventModel.updateOne(
      { _id: "christmas", onlineReservedCount: { $exists: false } },
      { $set: { onlineReservedCount: 0 } },
    ),
    EventModel.updateOne(
      { _id: "christmas", gateSaleCount: { $exists: false } },
      { $set: { gateSaleCount } },
    ),
  ]);

  const sandboxMigrationNeeded = await EventModel.exists({
    _id: "christmas",
    sandboxSalesExcluded: { $ne: true },
  });
  if (sandboxMigrationNeeded) {
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const realPaidFilter = {
          isPaid: true,
          stripeSessionId: { $not: /^cs_test_/ },
        };
        const paidTicketCount = await TicketModel.countDocuments(realPaidFilter)
          .session(session);
        const onlinePaidTicketCount = await TicketModel.countDocuments({
          ...realPaidFilter,
          paymentMethod: { $ne: "cash" },
        }).session(session);
        const gateSaleCount = await TicketModel.countDocuments({
          isPaid: true,
          paymentMethod: "cash",
        }).session(session);
        const migrated = await EventModel.updateOne(
          {
            _id: "christmas",
            sandboxSalesExcluded: { $ne: true },
          },
          {
            $set: {
              soldCount: paidTicketCount,
              onlineSoldCount: onlinePaidTicketCount,
              gateSaleCount,
              sandboxSalesExcluded: true,
            },
          },
          { session },
        );
        if (migrated.modifiedCount !== 1) {
          const eventState = await EventModel.findById("christmas")
            .select("sandboxSalesExcluded")
            .session(session)
            .lean();
          if (!eventState?.sandboxSalesExcluded) {
            throw new Error("Could not reconcile Sandbox ticket counts.");
          }
        }
      });
    } finally {
      await session.endSession();
    }
  }

  await expirePaymentAuthorizations();
}

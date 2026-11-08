import mongoose from "mongoose";
import { randomBytes } from "node:crypto";
import { mongooseReady } from "./mongoose.js";
import { EventModel, TicketModel, type TicketDocument } from "./models.js";
import type { EventData } from "./event-data.js";

export const registrationTiers = {
  earlyBird: { name: "Early Bird", price: 18, end: 25 },
  regular: { name: "Regular", price: 22, end: 75 },
  late: { name: "Late", price: 26, end: 120 },
} as const;

export type RegistrationTierName = keyof typeof registrationTiers;
export type RegistrationResult = {
  ticket: TicketDocument;
  wasExisting: boolean;
};

export function resolveRegistrationTier(
  registrationNumber: number,
): { key: RegistrationTierName; name: string; price: number } {
  const key =
    registrationNumber <= registrationTiers.earlyBird.end
      ? "earlyBird"
      : registrationNumber <= registrationTiers.regular.end
        ? "regular"
        : "late";
  return { key, ...registrationTiers[key] };
}

export function generateTicketCode(): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  return Array.from(randomBytes(8), (byte) => alphabet[byte % alphabet.length]).join("");
}

export async function ensureEventRegistrationState(event: EventData): Promise<void> {
  await mongooseReady;
  await EventModel.updateOne(
    { _id: "christmas" },
    {
      $set: {
        title: event.title,
        maxCapacity: 120,
        tierCaps: { earlyBird: 25, regular: 50, late: 45 },
        cashAtGateText: event.cashAtGateText,
      },
      $setOnInsert: { totalRegistered: 0 },
    },
    { upsert: true },
  );

  const existingState = await EventModel.findById("christmas").select(
    "totalRegistered",
  );
  if (existingState?.totalRegistered === undefined) {
    const registeredCount = await TicketModel.countDocuments({});
    await EventModel.updateOne(
      { _id: "christmas", totalRegistered: { $exists: false } },
      { $set: { totalRegistered: registeredCount } },
    );
  }
}

export async function registerAttendee(
  name: string,
  email: string,
  consentedAt = new Date(),
): Promise<RegistrationResult | null> {
  await mongooseReady;
  const mongoSession = await mongoose.startSession();
  try {
    let ticket: TicketDocument | null = null;
    await mongoSession.withTransaction(async () => {
      const event = await EventModel.findOneAndUpdate(
        { _id: "christmas", totalRegistered: { $lt: 120 } },
        { $inc: { totalRegistered: 1 } },
        { new: true, session: mongoSession },
      );
      if (!event) return;

      const registrationNumber = event.totalRegistered;
      const tier = resolveRegistrationTier(registrationNumber);
      [ticket] = await TicketModel.create(
        [
          {
            email,
            name,
            ticketCode: generateTicketCode(),
            registrationNumber,
            ticketTier: tier.key,
            gatePrice: tier.price,
            consentedAt,
          },
        ],
        { session: mongoSession },
      );
    });
    return ticket ? { ticket, wasExisting: false } : null;
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === 11000 &&
      "keyPattern" in error &&
      typeof error.keyPattern === "object" &&
      error.keyPattern !== null &&
      "email" in error.keyPattern
    ) {
      const existingTicket = await TicketModel.findOne({ email });
      return existingTicket ? { ticket: existingTicket, wasExisting: true } : null;
    }
    throw error;
  } finally {
    await mongoSession.endSession();
  }
}

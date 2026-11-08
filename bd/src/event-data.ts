import { type Collection } from "mongodb";
import { mongoClient, mongoReady } from "./mongodb.js";
import { mongooseReady } from "./mongoose.js";
import { ensureTicketIndexes, TicketModel } from "./models.js";

export type EventData = {
  _id: "christmas";
  title: string;
  description: string;
  date: string;
  time: string;
  location: string;
  posterUrl: string;
  ticketInfo: string;
  partyDescription: string;
  maxCapacity: number;
  totalRegistered: number;
  updatedAt?: Date;
};

export type EditableEvent = Omit<EventData, "_id" | "updatedAt">;
export type TicketTierName = "earlyBird" | "regular" | "late";

export type AdmissionTicket = {
  name: string;
  email: string;
  createdAt: Date;
  ticketTier?: TicketTierName;
  emailSentAt?: Date;
};

export type SentAdmissionTicket = Pick<
  AdmissionTicket,
  "name" | "email" | "ticketTier" | "emailSentAt"
> & {
  ticketNumber: number;
  isSandbox: boolean;
  emailSentAt: Date;
};

export const defaultChristmasEvent: EventData = {
  _id: "christmas",
  title: "Christmas together",
  description:
    "Join the Mongolian student community in Italy for a festive Christmas gathering.",
  date: "",
  time: "",
  location: "",
  posterUrl: "",
  ticketInfo:
    "We're preparing the official event ticket. The date, location, and ticket details will be shared here as soon as they're ready.",
  partyDescription:
    "Enjoy 2 cocktails and shared pizza. You are also welcome to bring a snack from outside.",
  maxCapacity: 120,
  totalRegistered: 0,
};

async function getEventCollection(): Promise<Collection<EventData>> {
  await mongoReady;
  return mongoClient.db().collection<EventData>("events");
}

export async function getChristmasEvent(): Promise<EventData> {
  const collection = await getEventCollection();
  const event = await collection.findOne(
    { _id: "christmas" },
    { projection: { cashAtGateText: 0, ticketPricing: 0 } },
  );

  return event ? { ...defaultChristmasEvent, ...event } : defaultChristmasEvent;
}

export async function saveChristmasEvent(event: EditableEvent): Promise<EventData> {
  const collection = await getEventCollection();
  const updatedAt = new Date();

  await collection.updateOne(
    { _id: "christmas" },
    { $set: { ...event, updatedAt } },
    { upsert: true },
  );

  return { _id: "christmas", ...event, updatedAt };
}

type LoginAttempt = {
  _id: string;
  attempts: number;
  expiresAt: Date;
};

const loginWindowMs = 15 * 60 * 1000;
const maxLoginAttempts = 5;
let loginTtlIndex: Promise<string> | undefined;

async function getLoginAttemptsCollection(): Promise<Collection<LoginAttempt>> {
  await mongoReady;
  const collection =
    mongoClient.db().collection<LoginAttempt>("admin_login_attempts");

  loginTtlIndex ??= collection.createIndex(
    { expiresAt: 1 },
    { expireAfterSeconds: 0 },
  );
  await loginTtlIndex;

  return collection;
}

function getLoginWindow(ipAddress: string, now: number) {
  const windowStart = Math.floor(now / loginWindowMs) * loginWindowMs;

  return {
    id: `${ipAddress}:${windowStart}`,
    expiresAt: new Date(windowStart + loginWindowMs * 2),
  };
}

export async function getLoginRetryAfter(ipAddress: string): Promise<number> {
  const now = Date.now();
  const window = getLoginWindow(ipAddress, now);
  const collection = await getLoginAttemptsCollection();
  const attempt = await collection.findOne({ _id: window.id });

  return !attempt || attempt.attempts < maxLoginAttempts
    ? 0
    : Math.max(1, Math.ceil((window.expiresAt.getTime() - now) / 1000));
}

export async function recordFailedLogin(ipAddress: string): Promise<void> {
  const window = getLoginWindow(ipAddress, Date.now());
  const collection = await getLoginAttemptsCollection();

  await collection.updateOne(
    { _id: window.id },
    {
      $inc: { attempts: 1 },
      $setOnInsert: { expiresAt: window.expiresAt },
    },
    { upsert: true },
  );
}

type RegistrationAttempt = {
  _id: string;
  attempts: number;
  expiresAt: Date;
};

const registrationWindowMs = 15 * 60 * 1000;
const maxRegistrationAttempts = 30;
let registrationTtlIndex: Promise<string> | undefined;

async function getRegistrationAttemptsCollection(): Promise<
  Collection<RegistrationAttempt>
> {
  await mongoReady;
  const collection =
    mongoClient.db().collection<RegistrationAttempt>("event_registration_attempts");

  registrationTtlIndex ??= collection.createIndex(
    { expiresAt: 1 },
    { expireAfterSeconds: 0 },
  );
  await registrationTtlIndex;

  return collection;
}

export async function getRegistrationRetryAfter(
  ipAddress: string,
): Promise<number> {
  const now = Date.now();
  const windowStart = Math.floor(now / registrationWindowMs) * registrationWindowMs;
  const windowEnd = windowStart + registrationWindowMs;
  const id = `${ipAddress}:${windowStart}`;
  const collection = await getRegistrationAttemptsCollection();

  try {
    await collection.updateOne(
      { _id: id },
      {
        $inc: { attempts: 1 },
        $setOnInsert: { expiresAt: new Date(windowEnd) },
      },
      { upsert: true },
    );
  } catch (error) {
    if (
      typeof error !== "object" ||
      error === null ||
      !("code" in error) ||
      error.code !== 11000
    ) {
      throw error;
    }
    await collection.updateOne({ _id: id }, { $inc: { attempts: 1 } });
  }

  const attempt = await collection.findOne({ _id: id });
  return !attempt || attempt.attempts <= maxRegistrationAttempts
    ? 0
    : Math.max(1, Math.ceil((windowEnd - now) / 1000));
}

export async function getSentAdmissionTicketCount(): Promise<number> {
  await mongooseReady;
  await ensureTicketIndexes();
  return TicketModel.countDocuments({
    isPaid: true,
    emailSentAt: { $exists: true },
  });
}

export async function getSentAdmissionTickets(): Promise<
  SentAdmissionTicket[]
> {
  await mongooseReady;
  await ensureTicketIndexes();
  const tickets = await TicketModel.find({
    isPaid: true,
    emailSentAt: { $exists: true },
  })
    .sort({ emailSentAt: -1 })
    .select("name email ticketTier ticketNumber stripeSessionId emailSentAt")
    .lean();
  return tickets.map(({ stripeSessionId, ...ticket }) => ({
    ...ticket,
    isSandbox: stripeSessionId.startsWith("cs_test_"),
  }));
}

export async function clearUnpaidLegacyTickets(): Promise<number> {
  await mongooseReady;
  await ensureTicketIndexes();
  const result = await TicketModel.deleteMany({ isPaid: { $ne: true } });
  return result.deletedCount;
}

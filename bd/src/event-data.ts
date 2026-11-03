import type { Collection } from "mongodb";
import { mongoClient, mongoReady } from "./mongodb.js";

export type EventData = {
  _id: "christmas";
  title: string;
  description: string;
  date: string;
  time: string;
  location: string;
  posterUrl: string;
  ticketInfo: string;
  updatedAt?: Date;
};

export type EditableEvent = Omit<EventData, "_id" | "updatedAt">;

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
};

async function getEventCollection(): Promise<Collection<EventData>> {
  await mongoReady;
  return mongoClient.db().collection<EventData>("events");
}

export async function getChristmasEvent(): Promise<EventData> {
  const collection = await getEventCollection();
  const event = await collection.findOne({ _id: "christmas" });

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

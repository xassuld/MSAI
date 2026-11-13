import mongoose from "mongoose";
import { mongooseReady } from "./mongoose.js";
import {
  EventModel,
  ensurePaymentAuthorizationIndexes,
  PaymentAuthorizationModel,
} from "./models.js";

const onlineTicketLimit = 100;
const totalTicketLimit = 120;

export type NewPaymentAuthorization = {
  stripeSessionId: string;
  stripePaymentIntentId: string;
  name: string;
  email: string;
  ticketTier: "earlyBird" | "regular" | "late";
  amountAuthorizedCents: number;
  currency: string;
  expiresAt: Date;
};

export async function recordPaymentAuthorization(
  authorization: NewPaymentAuthorization,
): Promise<"recorded" | "alreadyRecorded" | "finished" | "soldOut"> {
  await mongooseReady;
  await ensurePaymentAuthorizationIndexes();
  const session = await mongoose.startSession();
  const result: {
    status: "recorded" | "alreadyRecorded" | "finished" | "soldOut";
  } = {
    status: "recorded",
  };

  try {
    await session.withTransaction(async () => {
      result.status = "recorded";
      const existing = await PaymentAuthorizationModel.findOne({
        stripePaymentIntentId: authorization.stripePaymentIntentId,
      })
        .session(session)
        .lean();
      if (existing) {
        result.status =
          existing.status === "authorized" ? "alreadyRecorded" : "finished";
        return;
      }

      const reserved = await EventModel.findOneAndUpdate(
        {
          _id: "christmas",
          $expr: {
            $and: [
              {
                $lt: [
                  { $add: ["$soldCount", "$onlineReservedCount"] },
                  totalTicketLimit,
                ],
              },
              {
                $lt: [
                  { $add: ["$onlineSoldCount", "$onlineReservedCount"] },
                  onlineTicketLimit,
                ],
              },
            ],
          },
        },
        { $inc: { onlineReservedCount: 1 } },
        { new: true, session },
      );
      if (!reserved) {
        result.status = "soldOut";
        return;
      }

      await PaymentAuthorizationModel.create([authorization], { session });
    });
  } finally {
    await session.endSession();
  }

  return result.status;
}

export async function finishPaymentAuthorization(
  stripePaymentIntentId: string,
  status: "captured" | "released" | "expired",
): Promise<void> {
  await mongooseReady;
  await ensurePaymentAuthorizationIndexes();
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const authorization = await PaymentAuthorizationModel.findOneAndUpdate(
        { stripePaymentIntentId, status: "authorized" },
        { $set: { status } },
        { new: true, session },
      );
      if (!authorization) return;

      const released = await EventModel.updateOne(
        { _id: "christmas", onlineReservedCount: { $gt: 0 } },
        { $inc: { onlineReservedCount: -1 } },
        { session },
      );
      if (released.modifiedCount !== 1) {
        throw new Error("Payment authorization reservation count is inconsistent.");
      }
    });
  } finally {
    await session.endSession();
  }
}

export async function expirePaymentAuthorizations(): Promise<void> {
  await mongooseReady;
  await ensurePaymentAuthorizationIndexes();

  for (;;) {
    const expired = await PaymentAuthorizationModel.findOne({
      status: "authorized",
      expiresAt: { $lte: new Date() },
    })
      .sort({ expiresAt: 1 })
      .select("stripePaymentIntentId")
      .lean();
    if (!expired) return;
    await finishPaymentAuthorization(expired.stripePaymentIntentId, "expired");
  }
}

export async function getActivePaymentAuthorizations() {
  await mongooseReady;
  await ensurePaymentAuthorizationIndexes();
  return PaymentAuthorizationModel.find({
    status: "authorized",
    expiresAt: { $gt: new Date() },
  })
    .sort({ expiresAt: 1 })
    .select(
      "stripeSessionId stripePaymentIntentId name email ticketTier amountAuthorizedCents currency expiresAt createdAt",
    )
    .lean();
}

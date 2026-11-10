import mongoose, { type InferSchemaType } from "mongoose";

const { model, models, Schema } = mongoose;

const eventSchema = new Schema(
  {
    _id: { type: String, required: true },
    title: { type: String, required: true },
    maxCapacity: { type: Number, required: true, min: 1, default: 120 },
    soldCount: { type: Number, required: true, min: 0, default: 0 },
    onlineSoldCount: { type: Number, required: true, min: 0, default: 0 },
    gateSaleCount: { type: Number, required: true, min: 0, default: 0 },
    ticketCount: { type: Number, required: true, min: 0, default: 0 },
    countersInitialized: { type: Boolean, required: true, default: false },
    tierCaps: {
      earlyBird: { type: Number, required: true, min: 0, default: 20 },
      regular: { type: Number, required: true, min: 0, default: 55 },
      late: { type: Number, required: true, min: 0, default: 25 },
      atGate: { type: Number, required: true, min: 0, default: 20 },
    },
  },
  { collection: "events", versionKey: false },
);

const ticketSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, lowercase: true, trim: true },
    ticketCode: {
      type: String,
      required: true,
      minlength: 8,
      maxlength: 8,
      match: /^[A-Z0-9]{8}$/,
    },
    ticketNumber: { type: Number, required: true, min: 1 },
    ticketTier: {
      type: String,
      required: true,
      enum: ["earlyBird", "regular", "late", "atGate", "lateLate"],
    },
    amountPaidCents: {
      type: Number,
      required: true,
      enum: [0, 1500, 1800, 2200, 2500, 2600, 2800],
    },
    currency: { type: String, required: true, default: "eur", lowercase: true },
    paymentMethod: {
      type: String,
      enum: ["card", "cash", "complimentary"],
      default: "card",
    },
    stripeSessionId: { type: String },
    stripePaymentIntentId: { type: String },
    isPaid: { type: Boolean, required: true, default: true },
    isComplimentary: { type: Boolean, required: true, default: false },
    isCheckedIn: { type: Boolean, required: true, default: false },
    checkedInAt: Date,
    emailSentAt: Date,
  },
  {
    collection: "christmas_admission_tickets",
    timestamps: { createdAt: true, updatedAt: false },
  },
);

ticketSchema.index({ email: 1 });
ticketSchema.index({ ticketCode: 1 }, { unique: true });
ticketSchema.index({ stripeSessionId: 1 }, { unique: true, sparse: true });

export type EventDocument = InferSchemaType<typeof eventSchema>;
export type TicketDocument = InferSchemaType<typeof ticketSchema>;

export const EventModel = models.Event ?? model("Event", eventSchema);
export const TicketModel =
  models.ChristmasAdmissionTicket ??
  model("ChristmasAdmissionTicket", ticketSchema);

let ticketIndexesReady: Promise<void> | undefined;

export function ensureTicketIndexes(): Promise<void> {
  ticketIndexesReady ??= (async () => {
    let indexes;
    try {
      indexes = await TicketModel.collection.indexes();
    } catch (error) {
      if (
        typeof error !== "object" ||
        error === null ||
        !("code" in error) ||
        error.code !== 26
      ) {
        throw error;
      }
      await TicketModel.createCollection();
      indexes = await TicketModel.collection.indexes();
    }

    const uniqueEmailIndex = indexes.find(
      (index) => index.unique && index.key.email === 1,
    );
    if (uniqueEmailIndex?.name) {
      await TicketModel.collection.dropIndex(uniqueEmailIndex.name);
    }
    const obsoleteRegistrationNumberIndex = indexes.find(
      (index) => index.unique && index.key.registrationNumber === 1,
    );
    if (obsoleteRegistrationNumberIndex?.name) {
      await TicketModel.collection.dropIndex(obsoleteRegistrationNumberIndex.name);
    }
    await TicketModel.createIndexes();
  })();
  return ticketIndexesReady;
}

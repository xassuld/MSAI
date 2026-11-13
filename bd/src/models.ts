import mongoose, { type InferSchemaType } from "mongoose";

const { model, models, Schema } = mongoose;

const eventSchema = new Schema(
  {
    _id: { type: String, required: true },
    title: { type: String, required: true },
    maxCapacity: { type: Number, required: true, min: 1, default: 120 },
    soldCount: { type: Number, required: true, min: 0, default: 0 },
    onlineSoldCount: { type: Number, required: true, min: 0, default: 0 },
    onlineReservedCount: { type: Number, required: true, min: 0, default: 0 },
    gateSaleCount: { type: Number, required: true, min: 0, default: 0 },
    ticketCount: { type: Number, required: true, min: 0, default: 0 },
    countersInitialized: { type: Boolean, required: true, default: false },
    sandboxSalesExcluded: { type: Boolean, required: true, default: false },
    tierCaps: {
      earlyBird: { type: Number, required: true, min: 0, default: 20 },
      regular: { type: Number, required: true, min: 0, default: 55 },
      late: { type: Number, required: true, min: 0, default: 25 },
      atGate: { type: Number, required: true, min: 0, default: 20 },
    },
    ticketPrices: {
      earlyBird: { type: Number, required: true, min: 1, default: 1500 },
      regular: { type: Number, required: true, min: 1, default: 2500 },
      late: { type: Number, required: true, min: 1, default: 2800 },
      atGate: { type: Number, required: true, min: 1, default: 2800 },
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
      min: 0,
      max: 1000000,
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
    emailSendingAt: Date,
    emailSentAt: Date,
  },
  {
    collection: "christmas_admission_tickets",
    timestamps: { createdAt: true, updatedAt: false },
  },
);

const paymentAuthorizationSchema = new Schema(
  {
    stripeSessionId: { type: String, required: true },
    stripePaymentIntentId: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    ticketTier: {
      type: String,
      required: true,
      enum: ["earlyBird", "regular", "late"],
    },
    amountAuthorizedCents: { type: Number, required: true, min: 1, max: 1000000 },
    currency: { type: String, required: true, default: "eur", lowercase: true },
    status: {
      type: String,
      required: true,
      enum: ["authorized", "captured", "released", "expired"],
      default: "authorized",
    },
    expiresAt: { type: Date, required: true },
  },
  {
    collection: "christmas_payment_authorizations",
    timestamps: true,
  },
);

ticketSchema.index({ email: 1 });
ticketSchema.index({ ticketCode: 1 }, { unique: true });
ticketSchema.index({ stripeSessionId: 1 }, { unique: true, sparse: true });
paymentAuthorizationSchema.index({ stripeSessionId: 1 }, { unique: true });
paymentAuthorizationSchema.index({ stripePaymentIntentId: 1 }, { unique: true });
paymentAuthorizationSchema.index({ status: 1, expiresAt: 1 });

export type EventDocument = InferSchemaType<typeof eventSchema>;
export type TicketDocument = InferSchemaType<typeof ticketSchema>;
export type PaymentAuthorizationDocument = InferSchemaType<
  typeof paymentAuthorizationSchema
>;

export const EventModel = models.Event ?? model("Event", eventSchema);
export const TicketModel =
  models.ChristmasAdmissionTicket ??
  model("ChristmasAdmissionTicket", ticketSchema);
export const PaymentAuthorizationModel =
  models.ChristmasPaymentAuthorization ??
  model("ChristmasPaymentAuthorization", paymentAuthorizationSchema);

let ticketIndexesReady: Promise<void> | undefined;
let paymentAuthorizationIndexesReady: Promise<void> | undefined;

export function ensurePaymentAuthorizationIndexes(): Promise<void> {
  paymentAuthorizationIndexesReady ??= PaymentAuthorizationModel.createIndexes().then(
    () => undefined,
  );
  return paymentAuthorizationIndexesReady;
}

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

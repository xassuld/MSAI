import { model, models, Schema, type InferSchemaType } from "mongoose";

const eventSchema = new Schema(
  {
    _id: { type: String, required: true },
    title: { type: String, required: true },
    maxCapacity: { type: Number, required: true, min: 1, default: 100 },
    soldCount: { type: Number, required: true, min: 0, default: 0 },
  },
  { collection: "events", versionKey: false },
);

const ticketSchema = new Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    ticketCode: {
      type: String,
      required: true,
      unique: true,
      minlength: 8,
      maxlength: 8,
    },
    ticketTier: {
      type: String,
      required: true,
      enum: ["earlyBird", "regular", "late"],
    },
    amountPaidCents: { type: Number, required: true, min: 0 },
    currency: { type: String, default: "eur", lowercase: true },
    stripeSessionId: { type: String, required: true, unique: true },
    stripePaymentIntentId: { type: String },
    isPaid: { type: Boolean, default: false },
    emailSentAt: Date,
    isCheckedIn: { type: Boolean, default: false },
    checkedInAt: Date,
  },
  { collection: "christmas_admission_tickets", timestamps: { createdAt: true, updatedAt: false } },
);

ticketSchema.index({ email: 1 });
ticketSchema.index({ ticketCode: 1 }, { unique: true });

export type EventDocument = InferSchemaType<typeof eventSchema>;
export type TicketDocument = InferSchemaType<typeof ticketSchema>;

export const EventModel = models.Event ?? model("Event", eventSchema);
export const TicketModel =
  models.ChristmasAdmissionTicket ??
  model("ChristmasAdmissionTicket", ticketSchema);

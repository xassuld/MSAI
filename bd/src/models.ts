import mongoose, { type InferSchemaType } from "mongoose";

const { model, models, Schema } = mongoose;

const eventSchema = new Schema(
  {
    _id: { type: String, required: true },
    title: { type: String, required: true },
    maxCapacity: { type: Number, required: true, min: 1, default: 120 },
    totalRegistered: { type: Number, required: true, min: 0, default: 0 },
    tierCaps: {
      earlyBird: { type: Number, required: true, min: 0, default: 25 },
      regular: { type: Number, required: true, min: 0, default: 50 },
      late: { type: Number, required: true, min: 0, default: 45 },
    },
    cashAtGateText: { type: String, required: true, default: "Pay cash at the gate." },
  },
  { collection: "events", versionKey: false },
);

const ticketSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
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
    registrationNumber: { type: Number, required: true, min: 1, max: 120 },
    gatePrice: { type: Number, required: true, enum: [18, 22, 26] },
    isPaid: { type: Boolean, default: false },
    emailSentAt: Date,
    consentedAt: { type: Date, required: true },
    isCheckedIn: { type: Boolean, default: false },
    checkedInAt: Date,
  },
  { collection: "christmas_admission_tickets", timestamps: { createdAt: true, updatedAt: false } },
);

ticketSchema.index({ ticketCode: 1 }, { unique: true });
ticketSchema.index({ registrationNumber: 1 }, { unique: true });

export type EventDocument = InferSchemaType<typeof eventSchema>;
export type TicketDocument = InferSchemaType<typeof ticketSchema>;

export const EventModel = models.Event ?? model("Event", eventSchema);
export const TicketModel =
  models.ChristmasAdmissionTicket ??
  model("ChristmasAdmissionTicket", ticketSchema);

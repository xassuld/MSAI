import mongoose from "mongoose";

const uri = process.env.MONGODB_URI;

if (!uri) {
  throw new Error("MONGODB_URI is required.");
}

export const mongooseReady = mongoose.connect(uri, {
  serverSelectionTimeoutMS: 10_000,
});

export async function closeMongoose(): Promise<void> {
  await mongoose.disconnect();
}

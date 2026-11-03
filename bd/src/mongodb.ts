import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;

if (!uri) {
  throw new Error("MONGODB_URI is required.");
}

export const mongoClient = new MongoClient(uri, {
  serverSelectionTimeoutMS: 10_000,
});
export const mongoReady = mongoClient.connect();

export async function closeMongoDB(): Promise<void> {
  await mongoClient.close();
}

import { app } from "./app.js";
import { validateEnvironment } from "./env.js";
import { closeMongoDB, mongoReady } from "./mongodb.js";

validateEnvironment();

const port = Number(process.env.PORT ?? 4000);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be a valid TCP port.");
}

await mongoReady;

const server = app.listen(port, "0.0.0.0", () => {
  console.log(`MSAI backend listening on port ${port}.`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    server.close((error) => {
      if (error) {
        console.error("Failed to close the backend server cleanly.");
        process.exitCode = 1;
      }

      void closeMongoDB().catch(() => {
        console.error("Failed to close the MongoDB connection cleanly.");
        process.exitCode = 1;
      });
    });
  });
}

import { EnvConfig } from "@app/config";
import mongoose from "mongoose";
import { logger } from "../../utils/logger";

export const conn = mongoose.createConnection(EnvConfig.MONGODB_URI);

conn.on("connected", () => {
  logger.info({ db: "primary" }, "Database connected");
});
conn.on("error", (err) => {
  logger.error({ db: "primary", err }, "Database error");
});
conn.on("disconnected", () => {
  logger.warn({ db: "primary" }, "Database disconnected");
});

export async function connectPrimary(): Promise<void> {
  logger.info({ db: "primary" }, "Connecting to database");
  await conn.asPromise();
}

export async function closePrimary(): Promise<void> {
  logger.info({ db: "primary" }, "Closing database connection");
  await conn.close();
}

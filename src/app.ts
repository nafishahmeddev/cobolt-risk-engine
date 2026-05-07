import { Hono } from "hono";
import { startAllCrons, stopAllCrons } from "./cron/index";
import { closeDb, initDb } from "./database/index";
import { errorHandler, requestId, requestLogger } from "./middleware/index";
import { apiRouter } from "./routes/index";
import type { AppBindings } from "./types/api.types";

const app = new Hono<AppBindings>();

app.use("*", requestId);
app.use("*", requestLogger);

app.route("/api", apiRouter);

app.onError(errorHandler);

export { app };

export async function startup(): Promise<void> {
  await initDb();
  startAllCrons();
}

export async function shutdown(): Promise<void> {
  await stopAllCrons();
  await closeDb();
}

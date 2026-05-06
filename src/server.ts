import { randomUUID } from "node:crypto";
import { type ServerType, serve } from "@hono/node-server";
import { app, shutdown, startup } from "./app";
import { EnvConfig } from "./config/index";
import { logger } from "./utils/logger";
import { runWithTrace } from "./utils/trace";

async function main(): Promise<void> {
  await runWithTrace({ requestId: randomUUID() }, async () => {
    logger.info({ event: "server.start" }, "Starting server");

    await startup();

    const server: ServerType = serve(
      {
        fetch: app.fetch,
        port: EnvConfig.HTTP_PORT,
        hostname: EnvConfig.HTTP_HOST,
      },
      (info) => {
        logger.info({ event: "server.listening", port: info.port, address: info.address }, "Server running");
      },
    );

    process.on("SIGTERM", async () => {
      logger.info({ event: "server.sigterm" }, "SIGTERM received, shutting down");
      await shutdown();
      server.close();
      process.exit(0);
    });

    process.on("SIGINT", async () => {
      logger.info({ event: "server.sigint" }, "SIGINT received, shutting down");
      await shutdown();
      server.close();
      process.exit(0);
    });
  });
}

main().catch((err) => {
  logger.error({ err, event: "server.crash" }, "Failed to start server");
  process.exit(1);
});

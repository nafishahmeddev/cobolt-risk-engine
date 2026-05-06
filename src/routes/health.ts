import { Hono } from "hono";
import { success } from "../utils/response";

const healthRouter = new Hono();

healthRouter.get("/", (c) => {
  const data = {
    status: "ok",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  };

  return success(c, data, "Service is healthy");
});

export { healthRouter };

import type { MiddlewareHandler } from "hono";
import { EnvConfig } from "../config/env";
import { logger } from "../utils/logger";
import { unauthorized } from "../utils/response";
import { getTrace } from "../utils/trace";

export const auth: MiddlewareHandler = async (c, next) => {
  const { requestId } = getTrace();

  const header = c.req.header("authorization") ?? c.req.header("x-api-key");

  if (!header) {
    logger.warn({ requestId, path: c.req.path }, "Missing auth header");
    return unauthorized(c, "Missing API key");
  }

  const token = header.startsWith("Bearer ") ? header.slice(7) : header;

  if (token !== EnvConfig.APP_API_KEY) {
    logger.warn({ requestId, path: c.req.path }, "Invalid API key");
    return unauthorized(c, "Invalid API key");
  }

  c.set("userId", "api-client");

  await next();
};

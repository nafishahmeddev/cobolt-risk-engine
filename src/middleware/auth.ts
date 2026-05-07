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

  const apiKey = header.startsWith("Bearer ") ? header.slice(7) : header;

  if (apiKey !== EnvConfig.APP_API_KEY) {
    logger.warn({ requestId, path: c.req.path }, "Invalid API key");
    return unauthorized(c, "Invalid API key");
  }

  await next();
};

import type { Context, ErrorHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import { logger } from "../utils/logger";
import { badRequest, forbidden, notFound, serverError, tooMany, unauthorized } from "../utils/response";
import { getTrace } from "../utils/trace";

export const errorHandler: ErrorHandler = (err: Error, c: Context) => {
  const { requestId } = getTrace();

  if (err instanceof HTTPException) {
    const { status, message } = err;

    logger.warn({ requestId, path: c.req.path, method: c.req.method, status }, `HTTP ${status}: ${message}`);

    switch (status) {
      case 400:
        return badRequest(c, message);
      case 401:
        return unauthorized(c, message);
      case 403:
        return forbidden(c, message);
      case 404:
        return notFound(c, message);
      case 429:
        return tooMany(c, message);
      default:
        return serverError(c, message);
    }
  }

  logger.error(
    { requestId, name: err.name, stack: err.stack, path: c.req.path, method: c.req.method },
    `Unhandled: ${err.message}`,
  );

  return serverError(c);
};

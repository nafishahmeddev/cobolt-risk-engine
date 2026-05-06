import { randomUUID } from "node:crypto";
import type { MiddlewareHandler } from "hono";
import { runWithTrace } from "../utils/trace";

export const requestId: MiddlewareHandler = async (c, next) => {
  const requestId = c.req.header("x-request-id") ?? randomUUID();

  c.header("x-request-id", requestId);

  await runWithTrace({ requestId }, next);
};

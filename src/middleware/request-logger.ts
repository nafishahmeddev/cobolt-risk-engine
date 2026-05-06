import type { MiddlewareHandler } from "hono";
import { logger } from "../utils/logger";
import { sanitize } from "../utils/sanitize";
import { getTrace } from "../utils/trace";

const MAX_BODY_LOG = 10_240;

export const requestLogger: MiddlewareHandler = async (c, next) => {
  const { requestId } = getTrace();
  const method = c.req.method;
  const path = c.req.path;
  const start = performance.now();

  const params = c.req.param();
  const query = c.req.query();
  const headers = Object.fromEntries(c.req.raw.headers);

  let body: unknown;
  const contentType = headers["content-type"] ?? "";

  if (contentType.includes("application/json")) {
    try {
      const cloned = c.req.raw.clone();
      const text = await cloned.text();

      if (text && text.length <= MAX_BODY_LOG) {
        body = JSON.parse(text);
      } else if (text) {
        body = `[${(text.length / 1024).toFixed(1)}KB body]`;
      }
    } catch {
      body = "[unparseable body]";
    }
  }

  const requestMeta = sanitize({
    requestId,
    method,
    path,
    ...(Object.keys(params).length > 0 && { params }),
    ...(Object.keys(query).length > 0 && { query }),
    ...(body !== undefined && { body }),
    headers,
  });

  logger.info(requestMeta, "→ request");

  await next();

  const duration = (performance.now() - start).toFixed(2);
  const status = c.res.status;
  const resContentType = c.res.headers.get("content-type") ?? undefined;

  const responseMeta = sanitize({
    requestId,
    method,
    path,
    status,
    duration: `${duration}ms`,
    ...(resContentType && { contentType: resContentType }),
  });

  if (status >= 400) {
    logger.warn(responseMeta, "← response");
  } else {
    logger.info(responseMeta, "← response");
  }
};

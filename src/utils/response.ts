import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { ErrorResponse, SuccessResponse } from "../types/api.types";

export function success<T>(c: Context, data: T, message = "Success", status: ContentfulStatusCode = 200) {
  const body: SuccessResponse<T> = { success: true, message, data };
  return c.json(body, status);
}

export function error(
  c: Context,
  message: string,
  code = "INTERNAL_SERVER_ERROR",
  status: ContentfulStatusCode = 500,
  details?: unknown,
) {
  const body: ErrorResponse = {
    success: false,
    message,
    error: { code, details },
  };
  return c.json(body, status);
}

export function created<T>(c: Context, data: T, message = "Created") {
  return success(c, data, message, 201);
}

export function notFound(c: Context, message = "Resource not found") {
  return error(c, message, "NOT_FOUND", 404);
}

export function badRequest(c: Context, message: string, details?: unknown) {
  return error(c, message, "BAD_REQUEST", 400, details);
}

export function unauthorized(c: Context, message = "Unauthorized") {
  return error(c, message, "UNAUTHORIZED", 401);
}

export function forbidden(c: Context, message = "Forbidden") {
  return error(c, message, "FORBIDDEN", 403);
}

export function conflict(c: Context, message: string, details?: unknown) {
  return error(c, message, "CONFLICT", 409, details);
}

export function tooMany(c: Context, message = "Too many requests") {
  return error(c, message, "TOO_MANY_REQUESTS", 429);
}

export function serverError(c: Context, message = "Internal server error") {
  return error(c, message, "INTERNAL_SERVER_ERROR", 500);
}

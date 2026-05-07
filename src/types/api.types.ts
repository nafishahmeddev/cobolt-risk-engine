import type { ContentfulStatusCode } from "hono/utils/http-status";

export interface SuccessResponse<T = unknown> {
  success: true;
  message: string;
  data: T;
}

export interface ErrorDetail {
  code: string;
  details?: unknown;
}

export interface ErrorResponse {
  success: false;
  message: string;
  error: ErrorDetail;
}

export type ApiResponse<T = unknown> = SuccessResponse<T> | ErrorResponse;

export interface AppBindings {
  Variables: Record<string, never>;
}

export type HttpStatusCode = ContentfulStatusCode;

export type ErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "TOO_MANY_REQUESTS"
  | "INTERNAL_SERVER_ERROR"
  | "VALIDATION_ERROR";

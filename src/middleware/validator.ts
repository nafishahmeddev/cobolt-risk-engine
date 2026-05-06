import { zValidator } from "@hono/zod-validator";
import type { ValidationTargets } from "hono";
import type { z } from "zod";
import { badRequest } from "../utils/response";

export function zValidate<T extends z.ZodTypeAny>(target: keyof ValidationTargets, schema: T) {
  return zValidator(target, schema, (result, c) => {
    if (!result.success) {
      return badRequest(c, "Validation failed", result.error.issues);
    }
  });
}

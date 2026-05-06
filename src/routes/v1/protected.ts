import { Hono } from "hono";
import { auth } from "../../middleware/auth";
import type { AppBindings } from "../../types/api.types";
import { success } from "../../utils/response";

const protectedRouter = new Hono<AppBindings>();

protectedRouter.use("*", auth);

protectedRouter.get("/profile", (c) => {
  const userId = c.get("userId");

  return success(c, { userId });
});

export { protectedRouter };

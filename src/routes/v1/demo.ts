import { Hono } from "hono";
import { z } from "zod";
import { zValidate } from "../../middleware/validator";
import { success } from "../../utils/response";

const demoRouter = new Hono();

const greetSchema = z.object({
  name: z.string().min(1).max(100),
  age: z.number().int().positive().optional(),
});

demoRouter.post("/greet", zValidate("json", greetSchema), (c) => {
  const data = c.req.valid("json");

  return success(c, {
    message: `Hello ${data.name}${data.age ? `, age ${data.age}` : ""}`,
  });
});

export { demoRouter };

import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { auth } from "../../middleware/auth";
import { assessTransaction } from "../../services/risk";
import { type AssessRequest, TransactionType } from "../../types/risk";
import { badRequest, success } from "../../utils/response";

const riskRouter = new Hono();

riskRouter.use("*", auth);

const commonFields = {
  userRef: z.string().min(1),
  walletId: z.string().min(1),
  amount: z.number().int().positive(),
  currency: z.string().length(3),
  counterpartyRef: z.string().min(1).optional(),
} as const;

const depositSchema = z.object({
  ...commonFields,
  transactionType: z.literal(TransactionType.DEPOSIT),
});

const buyCryptoSchema = z.object({
  ...commonFields,
  transactionType: z.literal(TransactionType.BUY_CRYPTO),
  chain: z.string().min(1),
  toWalletId: z.string().min(1),
});

const withdrawCryptoSchema = z.object({
  ...commonFields,
  transactionType: z.literal(TransactionType.WITHDRAW_CRYPTO),
  chain: z.string().min(1),
  toWalletId: z.string().min(1),
});

const assessSchema = z.discriminatedUnion("transactionType", [depositSchema, buyCryptoSchema, withdrawCryptoSchema]);

riskRouter.post(
  "/assess",
  zValidator("json", assessSchema, (result, c) => {
    if (!result.success) return badRequest(c, "Validation failed", result.error.issues);
  }),
  async (c) => {
    const data = c.req.valid("json");
    const response = await assessTransaction(data as AssessRequest);
    return success(c, response);
  },
);

export { riskRouter };

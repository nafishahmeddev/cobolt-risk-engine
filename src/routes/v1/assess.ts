import { Hono } from "hono";
import { z } from "zod";
import { auth } from "../../middleware/auth";
import { zValidate } from "../../middleware/validator";
import { assessTransaction } from "../../services/assesment";
import type { AppBindings } from "../../types/api.types";
import { type AssessRequest } from "../../types/assesment";
import { success } from "../../utils/response";
import { TransactionType } from "@app/database/primary";

const assessRouter = new Hono<AppBindings>();

// ─── Schemas ─────────────────────────────────────────────────────────────────


const commonFields = {
  userRef: z.string().min(1),
  walletId: z.string().min(1),
  amount: z.number().int().positive(),
  currency: z.string().length(3),
  counterpartyId: z.string().min(1).optional(),
  callbackUrl: z.url(),
} as const;

const assessSchema = z.discriminatedUnion("transactionType", [
  z.object({
    ...commonFields,
    transactionType: z.literal(TransactionType.DEPOSIT),
    depositCountry: z.string().min(1),
  }),
  z.object({
    ...commonFields,
    transactionType: z.literal(TransactionType.BUY_CRYPTO),
    chain: z.string().min(1),
    destinationWalletId: z.string().min(1),
  }),
  z.object({
    ...commonFields,
    transactionType: z.literal(TransactionType.WITHDRAW_CRYPTO),
    chain: z.string().min(1),
    destinationWalletId: z.string().min(1),
  }),
]);

// ─── Routes ──────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/assesment
 * Submit a transaction for AML risk assessment.
 * Returns synchronously (success/failed) or asynchronously (pending).
 * When pending, the final result is POSTed to the provided callbackUrl
 * once the AMLBot poller resolves the check.
 */
assessRouter.post("/", auth, zValidate("json", assessSchema), async (c) => {
  const data = c.req.valid("json");
  const response = await assessTransaction(data as AssessRequest);
  return success(c, response);
});


export { assessRouter };
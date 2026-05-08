import { type Model, Schema } from "mongoose";
import { conn } from "../connection";
import type { IRuleResultDoc } from "./assesments";
import { AlertLevel, type RuleName, type TransactionType } from "@app/database/primary";

/**
 * Immutable audit record written once when an assessment finalises.
 * Never updated after creation — presence here = assessment complete.
 * `allow` captures the final decision; `triggeredRules` lists what fired.
 */
export interface IRiskLedger {
  /** Unique assessment identifier. */
  assessmentId: string;
  userRef: string;
  walletId: string;
  counterpartyId: string;
  chain: string;
  destinationWalletId: string;
  amount: number;
  currency: string;
  transactionType: TransactionType;
  /** Integrator's webhook URL — retained for audit trail. */
  callbackUrl: string;
  /** True if the transaction was approved; false if blocked. */
  allow: boolean;
  /** Names of all rules that fired. Empty = transaction passed all checks. */
  triggeredRules: RuleName[];
  /** Full rule-by-rule breakdown. Bounded to ≤7 items (one per rule). */
  ruleResults: IRuleResultDoc[];
  /** When the original assess request was received (copied from pending record). */
  createdAt: Date;
  /** Country of the deposit transaction. Only present for DEPOSIT transactions. */
  depositCountry: string;
}

const ruleResultSchema = new Schema<IRuleResultDoc>(
  {
    rule: { type: String, required: true },
    triggered: { type: Boolean, required: true },
    alertLevel: { type: String, enum: Object.values(AlertLevel), required: true },
    detail: { type: String, default: "" },
  },
  { _id: false },
);

const schema = new Schema<IRiskLedger>(
  {
    assessmentId: { type: String, required: true, unique: true },
    userRef: { type: String, required: true, index: true },
    walletId: { type: String, required: true },
    counterpartyId: { type: String, default: "" },
    chain: { type: String, default: "" },
    destinationWalletId: { type: String, default: "" },
    amount: { type: Number, required: true },
    currency: { type: String, required: true },
    depositCountry: { type: String, default: "" },
    transactionType: { type: String, required: true },
    callbackUrl: { type: String, required: true },
    allow: { type: Boolean, required: true },
    triggeredRules: { type: [String], default: [] },
    ruleResults: { type: [ruleResultSchema], default: [] },
    createdAt: { type: Date, required: true, index: true },
  },
  { collection: "ledger", timestamps: false, versionKey: false },
);

export const RiskLedger: Model<IRiskLedger> = conn.model<IRiskLedger>("RiskLedger", schema);

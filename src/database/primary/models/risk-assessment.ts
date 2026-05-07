import { type Model, Schema } from "mongoose";
import { AlertLevel, RuleName, TransactionType } from "../../../types/risk";
import { conn } from "../connection";

/** Partial rule result stored while an assessment is in-flight. */
export interface IRuleResultDoc {
  rule: RuleName;
  triggered: boolean;
  alertLevel: AlertLevel;
  detail: string;
}

/**
 * Mutable in-flight record created at the start of every assessment.
 * Deleted once the assessment is finalised and written to risk_ledger.
 * Presence here = assessment still in progress.
 */
export interface IRiskAssessment {
  /** Unique assessment identifier. */
  assessmentId: string;
  /** Internal user identifier from the integrator's system. */
  userRef: string;
  walletId: string;
  counterpartyId: string;
  chain: string;
  destinationWalletId: string;
  amount: number;
  currency: string;
  transactionType: TransactionType;
  /** Integrator's webhook URL — carried over to the ledger on finalisation. */
  callbackUrl: string;
  /**
   * AMLBot's internal request ID returned when processing is deferred.
   * The poller calls `recheckAddress` with this until a result arrives.
   * Empty string when AMLBot responded synchronously (no polling needed).
   */
  amlbotRequestId: string;
  /**
   * Rule results from all non-AMLBot rules that completed synchronously.
   * Bounded to ≤6 items. Populated only when AMLBot is deferred.
   */
  completedRuleResults: IRuleResultDoc[];
  /** When the original assess request was received. Copied to ledger on finalisation. */
  createdAt: Date;
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

const schema = new Schema<IRiskAssessment>(
  {
    assessmentId: { type: String, required: true, unique: true, index: true },
    userRef: { type: String, required: true, index: true },
    walletId: { type: String, required: true },
    counterpartyId: { type: String, default: "" },
    chain: { type: String, default: "" },
    destinationWalletId: { type: String, default: "" },
    amount: { type: Number, required: true },
    currency: { type: String, required: true },
    transactionType: { type: String, required: true },
    callbackUrl: { type: String, required: true },
    amlbotRequestId: { type: String, default: "", index: true },
    completedRuleResults: { type: [ruleResultSchema], default: [] },
    createdAt: { type: Date, required: true },
  },
  { collection: "risk_assessments", timestamps: false, versionKey: false },
);

export const RiskAssessment: Model<IRiskAssessment> = conn.model<IRiskAssessment>("RiskAssessment", schema);

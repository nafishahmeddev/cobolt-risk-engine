import { type Model, Schema } from "mongoose";
import { AlertLevel, type RuleName, type TransactionType } from "../../../types/risk";
import { conn } from "../connection";

/** Persisted rule result — stored in assessment doc while in-flight and copied to ledger on finalisation. */
export interface IRuleResultDoc {
  rule: RuleName;
  triggered: boolean;
  alertLevel: AlertLevel;
  detail: string;
}

/** A rule that did not complete synchronously — resolved asynchronously by the rule's registered resolver. */
export interface IDeferredRule {
  rule: RuleName;
  /** Rule-specific metadata consumed by the rule's deferred resolver. */
  metadata: Record<string, unknown>;
}

/**
 * Mutable in-flight record created at the start of every assessment.
 * Deleted once the assessment is finalised and written to risk_ledger.
 * Presence here = assessment still in progress.
 *
 * `ruleResults` collects all completed (sync + resolved-deferred) rule outcomes.
 * `deferredRules` tracks rules still waiting for async resolution.
 */
export interface IRiskAssessment {
  assessmentId: string;
  userRef: string;
  walletId: string;
  counterpartyId: string;
  chain: string;
  destinationWalletId: string;
  amount: number;
  currency: string;
  transactionType: TransactionType;
  callbackUrl: string;
  /** All rule results collected so far. Appended to as deferred rules resolve. */
  ruleResults: IRuleResultDoc[];
  /** Rules still pending async resolution. Cron iterates these and resolves via registered step resolver. */
  deferredRules: IDeferredRule[];
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

const deferredRuleSchema = new Schema<IDeferredRule>(
  {
    rule: { type: String, required: true },
    metadata: { type: Schema.Types.Mixed, default: {} },
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
    ruleResults: { type: [ruleResultSchema], default: [] },
    deferredRules: { type: [deferredRuleSchema], default: [] },
    createdAt: { type: Date, required: true },
  },
  { collection: "risk_assessments", timestamps: false, versionKey: false },
);

schema.index({ "deferredRules.0": 1, createdAt: 1 });

export const RiskAssessment: Model<IRiskAssessment> = conn.model<IRiskAssessment>("RiskAssessment", schema);

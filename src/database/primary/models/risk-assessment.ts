import { type Model, Schema } from "mongoose";
import { AlertLevel, RuleResultStatus, type RuleName, type TransactionType } from "../../../types/risk";
import { conn } from "../connection";


/**
 * Unified rule result within an in-flight assessment.
 * `status` tracks lifecycle: `pending` → `completed`.
 * When `pending`, `metadata` is populated for the deferred resolver.
 * When `completed`, `triggered`/`alertLevel`/`detail` carry the outcome.
 */
export interface IRuleResultDoc {
  rule: RuleName;
  status: RuleResultStatus;
  triggered: boolean;
  alertLevel?: AlertLevel;
  detail?: string;
  metadata?: Record<string, unknown>;
  startedAt?: Date;
  completedAt?: Date;
}

/**
 * Mutable in-flight record created at the start of every assessment.
 * Deleted once the assessment is finalised and written to risk_ledger.
 *
 * `ruleResults` is a unified array — each entry is either completed or pending.
 * The cron job resolves pending entries; once all are completed the assessment finalises.
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
  /** Unified rule results. Each entry is either pending (async) or completed. */
  ruleResults: IRuleResultDoc[];
  createdAt: Date;
}

const ruleResultSchema = new Schema<IRuleResultDoc>(
  {
    rule: { type: String, required: true },
    status: { type: String, enum: Object.values(RuleResultStatus), required: true },
    triggered: { type: Boolean, required: true },
    alertLevel: { type: String, enum: Object.values(AlertLevel), required: true },
    detail: { type: String, default: "" },
    metadata: { type: Schema.Types.Mixed },
    startedAt: { type: Date },
    completedAt: { type: Date },
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
    createdAt: { type: Date, required: true },
  },
  { collection: "risk_assessments", timestamps: false, versionKey: false },
);

schema.index({ "ruleResults.status": 1, createdAt: 1 });

export const RiskAssessment: Model<IRiskAssessment> = conn.model<IRiskAssessment>("RiskAssessment", schema);

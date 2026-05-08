import { type Model, Schema } from "mongoose";
import { conn } from "../connection";

/** Supported transaction categories. Determines which AML rules are evaluated. */
export enum TransactionType {
  /** Fiat currency deposit. No chain or destination wallet required. */
  DEPOSIT = "DEPOSIT",
  /** Purchase of cryptocurrency with fiat. Requires chain and destination wallet. */
  BUY_CRYPTO = "BUY_CRYPTO",
  /** Withdrawal of cryptocurrency to an external wallet. Requires chain and destination wallet. */
  WITHDRAW_CRYPTO = "WITHDRAW_CRYPTO",
}

export const TRANSACTION_TYPES = Object.values(TransactionType);

/** Returns true for transaction types that involve on-chain crypto movement. */
export function isCryptoType(t: TransactionType): boolean {
  return t === TransactionType.BUY_CRYPTO || t === TransactionType.WITHDRAW_CRYPTO;
}

/** Severity classification assigned to each AML rule. Used for reporting and alert routing. */
export enum AlertLevel {
  MEDIUM = "medium",
  HIGH = "high",
  CRITICAL = "critical",
}

export const ALERT_LEVELS = Object.values(AlertLevel);

/** AML rule identifiers — one per rule file. */
export enum RuleName {
  /** Transaction amount spikes far above the user's historical average. */
  VELOCITY_SPIKE = "VELOCITY_SPIKE",
  /** Unusually high number of transactions in a short time window. */
  HIGH_FREQUENCY = "HIGH_FREQUENCY",
  /** Transaction exceeds the user's declared expected size or new-account limits. */
  SIZE_EXCEED = "SIZE_EXCEED",
  /** Source, destination, or counterparty wallet is sanctioned or high-risk per AMLBot. */
  SANCTIONED_WALLET = "SANCTIONED_WALLET",
  /** Deposit volume over 24h surges beyond the user's established baseline. */
  CROSS_BORDER_SURGE = "CROSS_BORDER_SURGE",
  /** Multiple wallets linked to the same user, indicating Sybil or coordinated activity. */
  WALLET_CLUSTER = "WALLET_CLUSTER",
  /** Large transaction placed within 24h of a known market-moving event. */
  MARKET_EVENT = "MARKET_EVENT",
}

export const RULE_NAMES = Object.values(RuleName);

/**
 * Lifecycle status of a single risk assessment.
 * - `success`: assessment completed without error. Check `allow` for the transaction decision.
 * - `failed`: assessment could not be completed due to an internal error.
 * - `pending`: one or more rules deferred; final decision delivered via callback.
 */
export enum AssessmentStatus {
  SUCCESS = "success",
  FAILED = "failed",
  PENDING = "pending",
}

export const ASSESSMENT_STATUSES = Object.values(AssessmentStatus);

export enum TransactionDecision {
  ALLOW = "allow",
  BLOCK = "block",
  REVIEW = "review",
}

export const TRANSACTION_DECISIONS = Object.values(TransactionDecision);

/** Lifecycle status of a single rule result within an assessment. */
export enum RuleResultStatus {
  DEFERRED = "deferred",
  COMPLETED = "completed",
  PENDING = "pending",
  FAILED = "failed",
}

export const RULE_RESULT_STATUSES = Object.values(RuleResultStatus);


/** Result produced by a single AML rule evaluation. */
export interface RuleResult {
  /** The rule that produced this result. */
  rule: RuleName;
  /** Whether the rule fired and flagged this transaction. */
  triggered: boolean;
  /** Severity of the alert if the rule fires. */
  alertLevel: AlertLevel;
  /** Human-readable explanation of the rule outcome. Logged and stored for audit. */
  detail: string;
  /** True when the rule evaluation is deferred (async) and requires async resolution. */
  deferred?: boolean;
  /** Arbitrary metadata for the deferred step resolver. Shape depends on the rule. */
  metadata?: Record<string, unknown>;
}

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
 * Deleted once the assessment is finalised and written to ledger.
 *
 * `ruleResults` is a unified array — each entry is either completed or pending.
 * The cron job resolves pending entries; once all are completed the assessment finalises.
 */
export interface IAssesment {
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
  /** Country of the deposit transaction. Only present for DEPOSIT transactions. */
  depositCountry: string;
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

const schema = new Schema<IAssesment>(
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
    depositCountry: { type: String, default: "" },
  },
  { collection: "assesments", timestamps: false, versionKey: false },
);

schema.index({ "ruleResults.status": 1, createdAt: 1 });

export const Assesment: Model<IAssesment> = conn.model<IAssesment>("Assesment", schema);

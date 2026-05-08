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

/** Lifecycle status of a user's risk profile. */
export enum ProfileStatus {
  /** Normal — assessments proceed as usual. */
  ACTIVE = "active",
  /** Under review — assessments still run but flagged for manual inspection. */
  FLAGGED = "flagged",
  /** Suspended — all transactions blocked regardless of rule outcome. */
  BLOCKED = "blocked",
}

export const PROFILE_STATUSES = Object.values(ProfileStatus);

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

/** Payload sent by the integrator to request a risk assessment. */
export interface AssessRequestBase {
  /** Internal user identifier from the integrator's system. */
  userRef: string;
  /** Source wallet address or bank account identifier. */
  walletId: string;
  /** Transaction amount in the smallest currency unit (e.g. cents for EUR). */
  amount: number;
  /** ISO 4217 three-letter currency code (e.g. "EUR", "BTC"). */
  currency: string;
  /** Optional counterparty identifier (bank, exchange, or wallet). */
  counterpartyId?: string;
  /** Webhook URL to POST the final decision to when AMLBot completes asynchronously. */
  callbackUrl: string;
}

export interface AssessRequestDeposit extends AssessRequestBase {
  transactionType: TransactionType.DEPOSIT;
  depositCountry: string;
}

export interface AssessRequestBuyCrypto extends AssessRequestBase {
  transactionType: TransactionType.BUY_CRYPTO;
  chain: string;
  destinationWalletId: string;
}

export interface AssessRequestWithdrawCrypto extends AssessRequestBase {
  transactionType: TransactionType.WITHDRAW_CRYPTO;
  chain: string;
  destinationWalletId: string;
}

export type AssessRequest = AssessRequestDeposit | AssessRequestBuyCrypto | AssessRequestWithdrawCrypto;

/**
 * Result returned to the integrator after assessment completes.
 * - `success`: assessment ran without error. Check `allow` for the transaction decision.
 * - `pending`: async resolution in progress; final decision delivered to `callbackUrl`.
 * - `failed`: internal error — assessment could not be completed.
 */
export type AssessResponse =
  | { status: AssessmentStatus.SUCCESS; assessmentId: string; allow: boolean; triggeredRules: RuleName[] }
  | { status: AssessmentStatus.PENDING; assessmentId: string }
  | { status: AssessmentStatus.FAILED; assessmentId: string };

/**
 * Payload POSTed to the integrator's `callbackUrl` when an async assessment finalises.
 */
export interface AssessCallbackPayload {
  assessmentId: string;
  status: AssessmentStatus.SUCCESS | AssessmentStatus.FAILED;
  allow: boolean;
  triggeredRules: RuleName[];
}

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

/** Shared input passed to every rule function. Discriminated by transactionType. */
export interface RuleContextBase {
  assessmentId: string;
  userRef: string;
  walletId: string;
  amount: number;
  currency: string;
  /** Counterparty identifier, normalised to "" when absent. */
  counterpartyId: string;
  profile: RiskProfileData;
}

export interface RuleContextDeposit extends RuleContextBase {
  transactionType: TransactionType.DEPOSIT;
  depositCountry: string
}

export interface RuleContextBuyCrypto extends RuleContextBase {
  transactionType: TransactionType.BUY_CRYPTO;
  chain: string;
  destinationWalletId: string;
}

export interface RuleContextWithdrawCrypto extends RuleContextBase {
  transactionType: TransactionType.WITHDRAW_CRYPTO;
  chain: string;
  destinationWalletId: string;
}

export type RuleContext = RuleContextDeposit | RuleContextBuyCrypto | RuleContextWithdrawCrypto;

/** Plain-data snapshot of a user's risk profile, passed into rule evaluations. */
export interface RiskProfileData {
  /** Internal user identifier. */
  userRef: string;
  /** All wallet addresses linked to this user. */
  walletIds: string[];
  /** Current lifecycle status of the profile. */
  status: ProfileStatus;
  /** Timestamp when the user was onboarded onto the platform. */
  onboardedAt: Date;
  /** Customer's self-declared expected monthly transaction volume (smallest currency unit). */
  declaredMonthlyVolume: number;
  /** Exponentially weighted moving average of transaction amounts over approximately 30 days. */
  thirtyDayAverage: number;
  /** Established baseline for total 24h deposit volume, used by CROSS_BORDER_SURGE rule. */
  crossBorderBaseline: number;
  /** Rolling count of deposit transactions in the last 24 hours. */
  crossBorderCount24h: number;
  /** Total number of risk assessments run for this user. */
  totalAssessments: number;
  /** Timestamp of the most recent assessment. */
  lastAssessedAt: Date;
}

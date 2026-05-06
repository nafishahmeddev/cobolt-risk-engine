export enum TransactionType {
  DEPOSIT = "DEPOSIT",
  BUY_CRYPTO = "BUY_CRYPTO",
  WITHDRAW_CRYPTO = "WITHDRAW_CRYPTO",
}

export const TRANSACTION_TYPES = Object.values(TransactionType);

export function isCryptoType(t: TransactionType): boolean {
  return t === TransactionType.BUY_CRYPTO || t === TransactionType.WITHDRAW_CRYPTO;
}

export enum AlertLevel {
  MEDIUM = "medium",
  HIGH = "high",
  CRITICAL = "critical",
}

export const ALERT_LEVELS = Object.values(AlertLevel);

export enum ProfileStatus {
  ACTIVE = "active",
  FLAGGED = "flagged",
  BLOCKED = "blocked",
}

export const PROFILE_STATUSES = Object.values(ProfileStatus);

/** AML rule identifiers — one per rule file. */
export enum RuleName {
  VELOCITY_SPIKE    = "VELOCITY_SPIKE",
  HIGH_FREQUENCY    = "HIGH_FREQUENCY",
  SIZE_EXCEED       = "SIZE_EXCEED",
  SANCTIONED_WALLET = "SANCTIONED_WALLET",
  CROSS_BORDER_SURGE = "CROSS_BORDER_SURGE",
  WALLET_CLUSTER    = "WALLET_CLUSTER",
  MARKET_EVENT      = "MARKET_EVENT",
}

export const RULE_NAMES = Object.values(RuleName);

/** Incoming request from integrator. */
export interface AssessRequest {
  userRef: string;
  walletId: string;
  amount: number;
  currency: string;
  transactionType: TransactionType;
  counterpartyRef?: string;
  chain?: string;
  toWalletId?: string;
}

/** Response returned to integrator after assessment. */
export interface AssessResponse {
  assessId: string;
  allow: boolean;
  triggeredRules: RuleName[];
}

/** Output of a single AML rule evaluation. */
export interface RuleResult {
  rule: RuleName;
  triggered: boolean;
  alertLevel: AlertLevel;
  detail: string;
}

/** Context passed to every rule function. Optional fields are normalised to "" by the orchestrator. */
export interface RuleContext {
  userRef: string;
  walletId: string;
  amount: number;
  currency: string;
  transactionType: TransactionType;
  counterpartyRef: string;
  chain: string;
  toWalletId: string;
  profile: RiskProfileData;
}

/** Plain-data shape of a risk profile (mirrors the DB model). */
export interface RiskProfileData {
  userRef: string;
  walletIds: string[];
  status: ProfileStatus;
  onboardedAt: Date;
  declaredTransactionSize: number;
  thirtyDayAverage: number;
  crossBorderBaseline: number;
  crossBorderCount24h: number;
  totalAssessments: number;
  lastAssessedAt: Date;
}

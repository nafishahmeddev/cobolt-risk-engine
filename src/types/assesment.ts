import { TransactionType, AssessmentStatus, RuleName } from "@app/database/primary";
import type { IProfile } from "@app/database/primary";

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



/** Shared input passed to every rule function. Discriminated by transactionType. */
export interface RuleContextBase {
  assessmentId: string;
  userRef: string;
  walletId: string;
  amount: number;
  currency: string;
  /** Counterparty identifier, normalised to "" when absent. */
  counterpartyId: string;
  profile: IProfile;
}

export interface RuleContextDeposit extends RuleContextBase {
  transactionType: TransactionType.DEPOSIT;
  depositCountry: string;
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


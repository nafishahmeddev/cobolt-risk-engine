import { RiskLedger } from "../../../database/primary/models/risk-ledger";
import { AlertLevel, type RuleContext, RuleName, type RuleResult } from "../../../types/risk";

const WINDOW_10MIN_MS = 10 * 60 * 1000;
const WINDOW_1HR_MS = 60 * 60 * 1000;

/** Maximum allowed transactions within a 10-minute window before blocking. */
const MAX_TX_PER_10MIN = 10;

/** Maximum allowed transactions within a 1-hour window before blocking. */
const MAX_TX_PER_1HR = 30;

/**
 * Triggers if the user submits too many transactions in a short window:
 * - ≥ 10 transactions within 10 minutes (MEDIUM), or
 * - ≥ 30 transactions within 1 hour (MEDIUM)
 *
 * Counts are queried live from the ledger to avoid stale caches.
 */
export async function highFrequency(ctx: RuleContext): Promise<RuleResult> {
  const now = Date.now();

  const [txCount10Min, txCount1Hr] = await Promise.all([
    RiskLedger.countDocuments({ userRef: ctx.userRef, createdAt: { $gte: new Date(now - WINDOW_10MIN_MS) } }),
    RiskLedger.countDocuments({ userRef: ctx.userRef, createdAt: { $gte: new Date(now - WINDOW_1HR_MS) } }),
  ]);

  if (txCount10Min >= MAX_TX_PER_10MIN) {
    return {
      rule: RuleName.HIGH_FREQUENCY,
      triggered: true,
      alertLevel: AlertLevel.MEDIUM,
      detail: `${txCount10Min} transactions in 10 minutes (limit ${MAX_TX_PER_10MIN})`,
    };
  }

  if (txCount1Hr >= MAX_TX_PER_1HR) {
    return {
      rule: RuleName.HIGH_FREQUENCY,
      triggered: true,
      alertLevel: AlertLevel.MEDIUM,
      detail: `${txCount1Hr} transactions in 1 hour (limit ${MAX_TX_PER_1HR})`,
    };
  }

  return {
    rule: RuleName.HIGH_FREQUENCY,
    triggered: false,
    alertLevel: AlertLevel.MEDIUM,
    detail: "Transaction frequency within normal limits",
  };
}

import { RiskLedger } from "../../../database/primary/models/risk-ledger";
import { AlertLevel, type RuleContext, RuleName, type RuleResult } from "../../../types/risk";

const TEN_MIN_MS = 10 * 60 * 1000;
const ONE_HOUR_MS = 60 * 60 * 1000;
const TEN_MIN_LIMIT = 10;
const ONE_HOUR_LIMIT = 30;

/**
 * Triggers if:
 * - ≥ 10 transactions within 10 minutes (MEDIUM), or
 * - ≥ 30 transactions within 1 hour (MEDIUM)
 */
export async function highFrequency(ctx: RuleContext): Promise<RuleResult> {
  const now = Date.now();

  const [count10m, count1h] = await Promise.all([
    RiskLedger.countDocuments({ userRef: ctx.userRef, createdAt: { $gte: new Date(now - TEN_MIN_MS) } }),
    RiskLedger.countDocuments({ userRef: ctx.userRef, createdAt: { $gte: new Date(now - ONE_HOUR_MS) } }),
  ]);

  if (count10m >= TEN_MIN_LIMIT) {
    return {
      rule: RuleName.HIGH_FREQUENCY,
      triggered: true,
      alertLevel: AlertLevel.MEDIUM,
      detail: `${count10m} transactions in 10 minutes (limit ${TEN_MIN_LIMIT})`,
    };
  }

  if (count1h >= ONE_HOUR_LIMIT) {
    return {
      rule: RuleName.HIGH_FREQUENCY,
      triggered: true,
      alertLevel: AlertLevel.MEDIUM,
      detail: `${count1h} transactions in 1 hour (limit ${ONE_HOUR_LIMIT})`,
    };
  }

  return {
    rule: RuleName.HIGH_FREQUENCY,
    triggered: false,
    alertLevel: AlertLevel.MEDIUM,
    detail: "Transaction frequency within normal limits",
  };
}

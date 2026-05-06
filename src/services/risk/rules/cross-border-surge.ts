import { RiskLedger } from "../../../database/primary/models/risk-ledger";
import { AlertLevel, type RuleContext, RuleName, type RuleResult, TransactionType } from "../../../types/risk";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const MIN_COUNT_24H = 5;
const VOLUME_SURGE_RATIO = 1.5; // 150% of baseline

/**
 * Triggers if:
 * - ≥ 5 DEPOSIT transactions from this user in the last 24h AND
 * - Total 24h deposit volume > 150% of user's crossBorderBaseline (MEDIUM)
 *
 * Count and volume are queried live from risk_ledger to avoid stale profile counters.
 */
export async function crossBorderSurge(ctx: RuleContext): Promise<RuleResult> {
  const since = new Date(Date.now() - ONE_DAY_MS);

  const [stats] = await RiskLedger.aggregate<{ count: number; volume: number }>([
    {
      $match: {
        userRef: ctx.userRef,
        transactionType: TransactionType.DEPOSIT,
        createdAt: { $gte: since },
      },
    },
    {
      $group: { _id: null, count: { $sum: 1 }, volume: { $sum: "$amount" } },
    },
  ]);

  const count = stats?.count ?? 0;
  const volume = stats?.volume ?? 0;

  if (count < MIN_COUNT_24H) {
    return {
      rule: RuleName.CROSS_BORDER_SURGE,
      triggered: false,
      alertLevel: AlertLevel.MEDIUM,
      detail: `${count} deposit transactions in 24h (minimum ${MIN_COUNT_24H} to check volume)`,
    };
  }

  if (ctx.profile.crossBorderBaseline > 0 && volume > ctx.profile.crossBorderBaseline * VOLUME_SURGE_RATIO) {
    return {
      rule: RuleName.CROSS_BORDER_SURGE,
      triggered: true,
      alertLevel: AlertLevel.MEDIUM,
      detail: `24h deposit volume ${volume} exceeds 150% of baseline ${ctx.profile.crossBorderBaseline} (${count} transactions)`,
    };
  }

  return {
    rule: RuleName.CROSS_BORDER_SURGE,
    triggered: false,
    alertLevel: AlertLevel.MEDIUM,
    detail: `24h deposit volume ${volume} within baseline range (${count} transactions)`,
  };
}

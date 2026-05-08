import { RuleResult, RuleName, AlertLevel } from "@app/database/primary";
import { RuleContext } from "@app/types/assesment";

/** Block if a single transaction is more than 3× the user's monthly average. */
const MONTHLY_AVG_SPIKE_RATIO = 3;

/** Block any single transaction above EUR 250,000 (in minor units). */
const MAX_SINGLE_TX_AMOUNT = 25_000_000;

/**
 * Triggers if:
 * - Single transaction exceeds EUR 250,000 absolute limit (HIGH), or
 * - Amount ≥ 300% of the user's rolling 30-day average (MEDIUM)
 *
 * Skipped when the user has no transaction history yet (thirtyDayAverage = 0).
 */
export async function velocitySpike(ctx: RuleContext): Promise<RuleResult> {
  if (ctx.amount > MAX_SINGLE_TX_AMOUNT) {
    return {
      rule: RuleName.VELOCITY_SPIKE,
      triggered: true,
      alertLevel: AlertLevel.HIGH,
      detail: `Transaction of ${ctx.amount} exceeds EUR 250,000 absolute limit`,
    };
  }

  if (ctx.profile.thirtyDayAverage === 0) {
    return {
      rule: RuleName.VELOCITY_SPIKE,
      triggered: false,
      alertLevel: AlertLevel.MEDIUM,
      detail: "No transaction history yet — velocity ratio check skipped",
    };
  }

  const spikeRatio = ctx.amount / ctx.profile.thirtyDayAverage;

  if (spikeRatio >= MONTHLY_AVG_SPIKE_RATIO) {
    return {
      rule: RuleName.VELOCITY_SPIKE,
      triggered: true,
      alertLevel: AlertLevel.MEDIUM,
      detail: `Amount ${ctx.amount} is ${(spikeRatio * 100).toFixed(0)}% of monthly average ${ctx.profile.thirtyDayAverage} (limit ${MONTHLY_AVG_SPIKE_RATIO * 100}%)`,
    };
  }

  return {
    rule: RuleName.VELOCITY_SPIKE,
    triggered: false,
    alertLevel: AlertLevel.MEDIUM,
    detail: "Transaction within normal velocity range",
  };
}

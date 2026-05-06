import { AlertLevel, type RuleContext, RuleName, type RuleResult } from "../../../types/risk";

const THIRTY_DAY_MULTIPLIER = 3;      // 300% of 30-day average
const ABSOLUTE_THRESHOLD = 25_000_000; // EUR 250,000 in minor units

/**
 * Triggers if:
 * - Single transaction exceeds EUR 250,000 (HIGH), or
 * - Amount ≥ 300% of the user's 30-day rolling average (MEDIUM)
 */
export async function velocitySpike(ctx: RuleContext): Promise<RuleResult> {
  if (ctx.amount > ABSOLUTE_THRESHOLD) {
    return {
      rule: RuleName.VELOCITY_SPIKE,
      triggered: true,
      alertLevel: AlertLevel.HIGH,
      detail: `Transaction of ${ctx.amount} exceeds EUR 250,000 absolute threshold`,
    };
  }

  if (ctx.profile.thirtyDayAverage === 0) {
    return {
      rule: RuleName.VELOCITY_SPIKE,
      triggered: false,
      alertLevel: AlertLevel.MEDIUM,
      detail: "No 30-day average yet — velocity check skipped",
    };
  }

  const ratio = ctx.amount / ctx.profile.thirtyDayAverage;

  if (ratio >= THIRTY_DAY_MULTIPLIER) {
    return {
      rule: RuleName.VELOCITY_SPIKE,
      triggered: true,
      alertLevel: AlertLevel.MEDIUM,
      detail: `Amount ${ctx.amount} is ${(ratio * 100).toFixed(0)}% of 30-day average ${ctx.profile.thirtyDayAverage} (limit 300%)`,
    };
  }

  return {
    rule: RuleName.VELOCITY_SPIKE,
    triggered: false,
    alertLevel: AlertLevel.MEDIUM,
    detail: "Transaction within normal velocity range",
  };
}

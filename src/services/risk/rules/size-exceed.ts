import { AlertLevel, type RuleContext, RuleName, type RuleResult } from "../../../types/risk";

const DECLARED_MULTIPLIER = 2;    // 200% of declared size
const NEW_ACCOUNT_DAYS = 30;
const NEW_ACCOUNT_THRESHOLD = 10_000_000; // EUR 100,000 in minor units

/**
 * Triggers if:
 * - Transaction > 200% of declared expected size (HIGH), or
 * - Account < 30 days old and transaction > EUR 100,000 (HIGH)
 */
export async function sizeExceed(ctx: RuleContext): Promise<RuleResult> {
  const accountAgeDays = (Date.now() - ctx.profile.onboardedAt.getTime()) / (1000 * 60 * 60 * 24);

  if (accountAgeDays < NEW_ACCOUNT_DAYS && ctx.amount > NEW_ACCOUNT_THRESHOLD) {
    return {
      rule: RuleName.SIZE_EXCEED,
      triggered: true,
      alertLevel: AlertLevel.HIGH,
      detail: `New account (${accountAgeDays.toFixed(0)} days) with transaction of ${ctx.amount} exceeding EUR 100,000`,
    };
  }

  if (ctx.profile.declaredTransactionSize > 0 && ctx.amount > ctx.profile.declaredTransactionSize * DECLARED_MULTIPLIER) {
    return {
      rule: RuleName.SIZE_EXCEED,
      triggered: true,
      alertLevel: AlertLevel.HIGH,
      detail: `Transaction ${ctx.amount} exceeds 200% of declared size ${ctx.profile.declaredTransactionSize}`,
    };
  }

  return {
    rule: RuleName.SIZE_EXCEED,
    triggered: false,
    alertLevel: AlertLevel.HIGH,
    detail: "Transaction size within declared range",
  };
}

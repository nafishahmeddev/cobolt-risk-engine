import { AlertLevel, RuleName, type RuleResult } from "@app/database/primary";
import type { RuleContext } from "@app/types/assesment";

/** Block if transaction exceeds 2× the customer's declared monthly volume. */
const MAX_DECLARED_VOLUME_RATIO = 2;

/** Accounts younger than this many days are considered new and subject to stricter limits. */
const NEW_ACCOUNT_AGE_DAYS = 30;

/** Maximum single transaction allowed for accounts under 30 days old — EUR 100,000 in minor units. */
const NEW_ACCOUNT_MAX_TX_AMOUNT = 10_000_000;

/**
 * Triggers if:
 * - Account is < 30 days old and transaction > EUR 100,000 (HIGH), or
 * - Transaction > 200% of the customer's declared expected monthly volume (HIGH)
 *
 * The declared monthly volume is set during onboarding and represents the customer's
 * self-reported expected transaction size.
 */
export async function sizeExceed(ctx: RuleContext): Promise<RuleResult> {
  const accountAgeDays = (Date.now() - ctx.profile.onboardedAt.getTime()) / (1000 * 60 * 60 * 24);

  if (accountAgeDays < NEW_ACCOUNT_AGE_DAYS && ctx.amount > NEW_ACCOUNT_MAX_TX_AMOUNT) {
    return {
      rule: RuleName.SIZE_EXCEED,
      triggered: true,
      alertLevel: AlertLevel.HIGH,
      detail: `New account (${accountAgeDays.toFixed(0)} days old) with transaction of ${ctx.amount} exceeding EUR 100,000 new-account limit`,
    };
  }

  if (
    ctx.profile.declaredMonthlyVolume > 0 &&
    ctx.amount > ctx.profile.declaredMonthlyVolume * MAX_DECLARED_VOLUME_RATIO
  ) {
    return {
      rule: RuleName.SIZE_EXCEED,
      triggered: true,
      alertLevel: AlertLevel.HIGH,
      detail: `Transaction ${ctx.amount} exceeds ${MAX_DECLARED_VOLUME_RATIO * 100}% of declared monthly volume ${ctx.profile.declaredMonthlyVolume}`,
    };
  }

  return {
    rule: RuleName.SIZE_EXCEED,
    triggered: false,
    alertLevel: AlertLevel.HIGH,
    detail: "Transaction size within declared range",
  };
}

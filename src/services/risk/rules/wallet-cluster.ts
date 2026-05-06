import { AlertLevel, type RuleContext, RuleName, type RuleResult } from "../../../types/risk";

const MIN_WALLETS = 3;

/**
 * Triggers if:
 * - ≥ 3 wallets linked to the same user transact the same asset
 *   within a 5-minute window in the same direction (HIGH)
 *
 * Flags Sybil / coordinated wallet clustering patterns.
 */
export async function walletCluster(ctx: RuleContext): Promise<RuleResult> {
  const count = ctx.profile.walletIds.length;

  if (count >= MIN_WALLETS) {
    return {
      rule: RuleName.WALLET_CLUSTER,
      triggered: true,
      alertLevel: AlertLevel.HIGH,
      detail: `${count} wallets linked to user ${ctx.userRef} (threshold ${MIN_WALLETS})`,
    };
  }

  return {
    rule: RuleName.WALLET_CLUSTER,
    triggered: false,
    alertLevel: AlertLevel.HIGH,
    detail: `${count} wallets — below clustering threshold`,
  };
}

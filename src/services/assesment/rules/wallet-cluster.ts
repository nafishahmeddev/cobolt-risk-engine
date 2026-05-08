import { RuleResult, RuleName, AlertLevel } from "@app/database/primary";
import { RuleContext } from "@app/types/assesment";

/** Minimum number of linked wallets that indicates suspicious clustering activity. */
const WALLET_CLUSTER_THRESHOLD = 3;

/**
 * Triggers if ≥ 3 distinct wallets are linked to the same user (HIGH).
 *
 * Flags potential Sybil attacks and coordinated wallet clustering, where a single
 * entity controls multiple wallets to split and obscure transaction patterns.
 */
export async function walletCluster(ctx: RuleContext): Promise<RuleResult> {
  const linkedWalletCount = ctx.profile.walletIds.length;

  if (linkedWalletCount >= WALLET_CLUSTER_THRESHOLD) {
    return {
      rule: RuleName.WALLET_CLUSTER,
      triggered: true,
      alertLevel: AlertLevel.HIGH,
      detail: `${linkedWalletCount} wallets linked to user ${ctx.userRef} (threshold ${WALLET_CLUSTER_THRESHOLD})`,
    };
  }

  return {
    rule: RuleName.WALLET_CLUSTER,
    triggered: false,
    alertLevel: AlertLevel.HIGH,
    detail: `${linkedWalletCount} wallet(s) — below clustering threshold of ${WALLET_CLUSTER_THRESHOLD}`,
  };
}

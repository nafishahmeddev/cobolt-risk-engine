import { type RuleContext, RuleName, type RuleResult, TransactionType } from "../../../types/risk";
import { crossBorderSurge } from "./cross-border-surge";
import { highFrequency } from "./high-frequency";
import { marketEvent } from "./market-event";
import { sanctionedWallet } from "./sanctioned-wallet";
import { sizeExceed } from "./size-exceed";
import { velocitySpike } from "./velocity-spike";
import { walletCluster } from "./wallet-cluster";

type RuleFn = (ctx: RuleContext) => Promise<RuleResult>;

/**
 * Step 1 — Register rule name → implementation.
 * Adding a new rule: add the function here.
 */
const RULE_MAP: Record<RuleName, RuleFn> = {
  [RuleName.VELOCITY_SPIKE]: velocitySpike,
  [RuleName.HIGH_FREQUENCY]: highFrequency,
  [RuleName.SIZE_EXCEED]: sizeExceed,
  [RuleName.SANCTIONED_WALLET]: sanctionedWallet,
  [RuleName.CROSS_BORDER_SURGE]: crossBorderSurge,
  [RuleName.WALLET_CLUSTER]: walletCluster,
  [RuleName.MARKET_EVENT]: marketEvent,
};

/**
 * Step 2 — Configure which rules run per transaction type.
 * TypeScript enforces all TransactionType values are covered.
 */
const RULES_BY_TYPE: Record<TransactionType, RuleName[]> = {
  [TransactionType.DEPOSIT]: [
    RuleName.VELOCITY_SPIKE,
    RuleName.HIGH_FREQUENCY,
    RuleName.SIZE_EXCEED,
    RuleName.SANCTIONED_WALLET,
    RuleName.CROSS_BORDER_SURGE,
    RuleName.WALLET_CLUSTER,
  ],
  [TransactionType.BUY_CRYPTO]: [
    RuleName.VELOCITY_SPIKE,
    RuleName.HIGH_FREQUENCY,
    RuleName.SIZE_EXCEED,
    RuleName.SANCTIONED_WALLET,
    RuleName.WALLET_CLUSTER,
    RuleName.MARKET_EVENT,
  ],
  [TransactionType.WITHDRAW_CRYPTO]: [
    RuleName.VELOCITY_SPIKE,
    RuleName.HIGH_FREQUENCY,
    RuleName.SIZE_EXCEED,
    RuleName.SANCTIONED_WALLET,
    RuleName.WALLET_CLUSTER,
  ],
};

/** Run all applicable rules in parallel. Any rule failure rejects the whole assessment. */
export async function evaluateAllRules(ctx: RuleContext): Promise<RuleResult[]> {
  const ruleNames = RULES_BY_TYPE[ctx.transactionType];
  return Promise.all(ruleNames.map((name) => RULE_MAP[name](ctx)));
}

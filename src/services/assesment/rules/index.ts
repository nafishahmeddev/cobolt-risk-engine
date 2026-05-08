import { RuleName, TransactionType, AlertLevel } from "@app/database/primary";
import { recheckAddress } from "../../amlbot";
import { crossBorderSurge } from "./cross-border-surge";
import { highFrequency } from "./high-frequency";
import { marketEvent } from "./market-event";
import { registerDeferredResolver, registerRule } from "./registry";
import { sanctionedWallet } from "./sanctioned-wallet";
import { sizeExceed } from "./size-exceed";
import { velocitySpike } from "./velocity-spike";
import { walletCluster } from "./wallet-cluster";

// ─── Rule registrations ────────────────────────────────────────────────────
// New rules: create a handler file + add one registerRule() call here.
// The core assessment flow never changes.

registerRule({
  name: RuleName.VELOCITY_SPIKE,
  handler: velocitySpike,
  appliesTo: [TransactionType.DEPOSIT, TransactionType.BUY_CRYPTO, TransactionType.WITHDRAW_CRYPTO],
});

registerRule({
  name: RuleName.HIGH_FREQUENCY,
  handler: highFrequency,
  appliesTo: [TransactionType.DEPOSIT, TransactionType.BUY_CRYPTO, TransactionType.WITHDRAW_CRYPTO],
});

registerRule({
  name: RuleName.SIZE_EXCEED,
  handler: sizeExceed,
  appliesTo: [TransactionType.DEPOSIT, TransactionType.BUY_CRYPTO, TransactionType.WITHDRAW_CRYPTO],
});

registerRule({
  name: RuleName.SANCTIONED_WALLET,
  handler: sanctionedWallet,
  appliesTo: [TransactionType.DEPOSIT, TransactionType.BUY_CRYPTO, TransactionType.WITHDRAW_CRYPTO],
});

registerRule({
  name: RuleName.CROSS_BORDER_SURGE,
  handler: crossBorderSurge,
  appliesTo: [TransactionType.DEPOSIT],
});

registerRule({
  name: RuleName.WALLET_CLUSTER,
  handler: walletCluster,
  appliesTo: [TransactionType.DEPOSIT, TransactionType.BUY_CRYPTO, TransactionType.WITHDRAW_CRYPTO],
});

registerRule({
  name: RuleName.MARKET_EVENT,
  handler: marketEvent,
  appliesTo: [TransactionType.BUY_CRYPTO],
});

// ─── Deferred resolvers ──────────────────────────────────────────────────────
// Rules that support async/deferred evaluation register a resolver keyed by
// RuleName. The generic cron job looks up the resolver to check completion
// and obtain the final result. Rules without a resolver resolve externally.

registerDeferredResolver(RuleName.SANCTIONED_WALLET, async (metadata) => {
  const requestId = metadata.requestId as string;
  const result = await recheckAddress(requestId);

  if (result.pending) {
    return { completed: false };
  }

  return {
    completed: true,
    result: {
      rule: RuleName.SANCTIONED_WALLET,
      triggered: result.flagged,
      alertLevel: AlertLevel.CRITICAL,
      detail: result.flagged
        ? `Address flagged via AMLBot — ${result.sanctioned ? "sanctions match (OFAC/EU/UN)" : `risk score ${result.riskScore}/100 exceeds threshold`}`
        : `Address clean via AMLBot (risk score ${result.riskScore}/100)`,
    },
  };
});

export { evaluateAllRules, getRulesForType } from "./registry";

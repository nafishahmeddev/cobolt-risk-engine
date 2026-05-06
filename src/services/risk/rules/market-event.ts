import { AlertLevel, type RuleContext, RuleName, type RuleResult } from "../../../types/risk";

const LARGE_TX_THRESHOLD = 10_000_000; // EUR 100,000 in minor units

/**
 * Triggers if:
 * - Transaction > EUR 100,000 AND
 * - Within 24h before a known market-moving event for that currency (HIGH)
 *
 * Production: integrate with market events feed or news API.
 */
export async function marketEvent(ctx: RuleContext): Promise<RuleResult> {
  if (ctx.amount <= LARGE_TX_THRESHOLD) {
    return {
      rule: RuleName.MARKET_EVENT,
      triggered: false,
      alertLevel: AlertLevel.HIGH,
      detail: "Transaction at or below EUR 100,000 threshold",
    };
  }

  const hasEvent = await checkMarketEvent(ctx.currency);

  if (hasEvent) {
    return {
      rule: RuleName.MARKET_EVENT,
      triggered: true,
      alertLevel: AlertLevel.HIGH,
      detail: `Transaction of ${ctx.amount} in ${ctx.currency} within 24h of a known market-moving event`,
    };
  }

  return {
    rule: RuleName.MARKET_EVENT,
    triggered: false,
    alertLevel: AlertLevel.HIGH,
    detail: "No market-moving event detected for this currency",
  };
}

/** Stub — replace with market events API call in production. */
async function checkMarketEvent(_currency: string): Promise<boolean> {
  return false;
}

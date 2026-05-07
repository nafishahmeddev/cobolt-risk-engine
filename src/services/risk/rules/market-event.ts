import { AlertLevel, type RuleContext, RuleName, type RuleResult } from "../../../types/risk";

/** Only check for market events if the transaction exceeds EUR 100,000 (in minor units). */
const MARKET_EVENT_MIN_TX_AMOUNT = 10_000_000;

/**
 * Triggers if the transaction is large AND coincides with a known market-moving event:
 * - Transaction > EUR 100,000, AND
 * - A market event is active for the transaction's currency within 24h (HIGH)
 *
 * Large transactions placed around market events (exchange listings, regulatory
 * announcements, hard forks) can indicate front-running or wash trading.
 *
 * Production: replace `checkMarketEvent` with a real market events feed or news API.
 */
export async function marketEvent(ctx: RuleContext): Promise<RuleResult> {
  if (ctx.amount <= MARKET_EVENT_MIN_TX_AMOUNT) {
    return {
      rule: RuleName.MARKET_EVENT,
      triggered: false,
      alertLevel: AlertLevel.HIGH,
      detail: `Transaction ${ctx.amount} at or below EUR 100,000 market-event threshold`,
    };
  }

  const isMarketEventActive = await checkMarketEvent(ctx.currency);

  if (isMarketEventActive) {
    return {
      rule: RuleName.MARKET_EVENT,
      triggered: true,
      alertLevel: AlertLevel.HIGH,
      detail: `Transaction of ${ctx.amount} in ${ctx.currency} placed within 24h of a known market-moving event`,
    };
  }

  return {
    rule: RuleName.MARKET_EVENT,
    triggered: false,
    alertLevel: AlertLevel.HIGH,
    detail: `No active market event detected for ${ctx.currency}`,
  };
}

/** Stub — replace with a real market events API call in production. */
async function checkMarketEvent(_currency: string): Promise<boolean> {
  return false;
}

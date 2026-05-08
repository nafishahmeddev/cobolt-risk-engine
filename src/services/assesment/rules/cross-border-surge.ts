import { AlertLevel, RuleName, type RuleResult, TransactionType } from "@app/database/primary";
import type { RuleContext } from "@app/types/assesment";
import { RiskLedger } from "../../../database/primary/models/ledger";

const WINDOW_24HR_MS = 24 * 60 * 60 * 1000;

/** Minimum number of deposits in 24h required before the volume surge check runs. */
const MIN_DEPOSITS_24HR = 5;

/** Block if 24h deposit volume exceeds 150% of the user's established deposit baseline. */
const SURGE_VOLUME_MULTIPLIER = 1.5;

/**
 * Triggers if the user shows a sudden surge in cross-border deposit activity:
 * - ≥ 5 DEPOSIT transactions in the last 24h, AND
 * - Total 24h deposit volume > 150% of the user's crossBorderBaseline (MEDIUM)
 *
 * Volume and count are queried live from the ledger on every call to avoid
 * relying on the profile's crossBorderCount24h, which is not incrementally updated.
 */
export async function crossBorderSurge(ctx: RuleContext): Promise<RuleResult> {
  const since = new Date(Date.now() - WINDOW_24HR_MS);

  if (ctx.transactionType !== TransactionType.DEPOSIT) {
    return {
      rule: RuleName.CROSS_BORDER_SURGE,
      triggered: false,
      alertLevel: AlertLevel.MEDIUM,
      detail: `Not a deposit transaction`,
    };
  }

  //for now we are just checking past histories later we will check in different sources like ( internal services)
  const [stats] = await RiskLedger.aggregate<{ count: number; volume: number }>([
    {
      $match: {
        userRef: ctx.userRef,
        transactionType: TransactionType.DEPOSIT,
        depositCountry: ctx.depositCountry,
        createdAt: { $gte: since },
      },
    },
    {
      $group: { _id: null, count: { $sum: 1 }, volume: { $sum: "$amount" } },
    },
  ]);

  const depositCount = stats?.count ?? 0;
  const depositVolume = stats?.volume ?? 0;

  if (depositCount < MIN_DEPOSITS_24HR) {
    return {
      rule: RuleName.CROSS_BORDER_SURGE,
      triggered: false,
      alertLevel: AlertLevel.MEDIUM,
      detail: `${depositCount} deposit(s) in last 24h — minimum ${MIN_DEPOSITS_24HR} required before volume check`,
    };
  }

  if (
    ctx.profile.crossBorderBaseline > 0 &&
    depositVolume > ctx.profile.crossBorderBaseline * SURGE_VOLUME_MULTIPLIER
  ) {
    return {
      rule: RuleName.CROSS_BORDER_SURGE,
      triggered: true,
      alertLevel: AlertLevel.MEDIUM,
      detail: `24h deposit volume ${depositVolume} exceeds ${SURGE_VOLUME_MULTIPLIER * 100}% of baseline ${ctx.profile.crossBorderBaseline} (${depositCount} deposits)`,
    };
  }

  return {
    rule: RuleName.CROSS_BORDER_SURGE,
    triggered: false,
    alertLevel: AlertLevel.MEDIUM,
    detail: `24h deposit volume ${depositVolume} within baseline range (${depositCount} deposits)`,
  };
}

import { AlertLevel, RuleName, type RuleResult, TransactionType } from "@app/database/primary";
import type { RuleContext, RuleContextBuyCrypto, RuleContextWithdrawCrypto } from "@app/types/assesment";
import { screenAddress } from "../../amlbot";

type CryptoRuleContext = RuleContextBuyCrypto | RuleContextWithdrawCrypto;

interface Candidate {
  address: string;
  label: "source" | "counterparty" | "destination";
}

function buildCandidates(ctx: CryptoRuleContext): Candidate[] {
  return [
    { address: ctx.walletId, label: "source" },
    ...(ctx.counterpartyId ? [{ address: ctx.counterpartyId, label: "counterparty" as const }] : []),
    { address: ctx.destinationWalletId, label: "destination" as const },
  ];
}

function flagDetail(candidate: Candidate, sanctioned: boolean, score: number): string {
  const reason = sanctioned ? "matched sanctions list (OFAC/EU/UN)" : `risk score ${score}/100 exceeds threshold`;
  return `${candidate.label} address ${candidate.address} flagged — ${reason}`;
}

/**
 * Screens all transaction addresses via AMLBot.
 * Triggers CRITICAL if any address is sanctioned or has risk score ≥ 75.
 * Returns `deferred: true` with `metadata.requestId` when AMLBot defers —
 * the generic cron resolves via the registered deferred resolver.
 * Skipped for fiat DEPOSIT (no blockchain context).
 */
export async function sanctionedWallet(ctx: RuleContext): Promise<RuleResult> {
  if (ctx.transactionType === TransactionType.DEPOSIT) {
    return {
      rule: RuleName.SANCTIONED_WALLET,
      triggered: false,
      alertLevel: AlertLevel.CRITICAL,
      detail: "No chain context — AMLBot screening skipped",
    };
  }

  const coin = ctx.chain.toUpperCase();
  const candidates = buildCandidates(ctx);

  for (const candidate of candidates) {
    const result = await screenAddress(candidate.address, coin);

    if (result.pending) {
      return {
        rule: RuleName.SANCTIONED_WALLET,
        triggered: false,
        alertLevel: AlertLevel.CRITICAL,
        detail: `AMLBot check deferred for ${candidate.label} address — poller will resolve`,
        deferred: true,
        metadata: { requestId: result.requestId },
      };
    }

    if (result.flagged) {
      return {
        rule: RuleName.SANCTIONED_WALLET,
        triggered: true,
        alertLevel: AlertLevel.CRITICAL,
        detail: flagDetail(candidate, result.sanctioned, result.riskScore),
      };
    }
  }

  return {
    rule: RuleName.SANCTIONED_WALLET,
    triggered: false,
    alertLevel: AlertLevel.CRITICAL,
    detail: `All ${candidates.length} address(es) clean via AMLBot`,
  };
}

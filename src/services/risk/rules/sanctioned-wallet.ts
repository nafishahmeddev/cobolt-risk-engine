import { AlertLevel, type RuleContext, RuleName, type RuleResult } from "../../../types/risk";
import { screenAddress } from "../../amlbot";

interface Candidate {
  address: string;
  label: "source" | "counterparty" | "destination";
}

function buildCandidates(ctx: RuleContext): Candidate[] {
  return [
    { address: ctx.walletId, label: "source" },
    ...(ctx.counterpartyId ? [{ address: ctx.counterpartyId, label: "counterparty" as const }] : []),
    ...(ctx.destinationWalletId ? [{ address: ctx.destinationWalletId, label: "destination" as const }] : []),
  ];
}

function flagDetail(candidate: Candidate, sanctioned: boolean, score: number): string {
  const reason = sanctioned ? "matched sanctions list (OFAC/EU/UN)" : `risk score ${score}/100 exceeds threshold`;
  return `${candidate.label} address ${candidate.address} flagged — ${reason}`;
}

/**
 * Screens all addresses in the transaction via AMLBot.
 * Triggers CRITICAL if any address is sanctioned or has risk score ≥ 75.
 * Returns `pending: true` with `amlbotRequestId` when AMLBot defers processing —
 * the poller resolves via `recheckAddress`.
 * Skipped when no chain is present (fiat DEPOSIT without crypto wallet context).
 */
export async function sanctionedWallet(ctx: RuleContext): Promise<RuleResult> {
  if (!ctx.chain) {
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
        pending: true,
        amlbotRequestId: result.requestId,
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

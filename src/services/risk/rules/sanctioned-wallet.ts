import { AlertLevel, type RuleContext, RuleName, type RuleResult } from "../../../types/risk";
import { screenAddress } from "../../amlbot";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Candidate {
  address: string;
  label: "source" | "counterparty" | "destination";
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildCandidates(ctx: RuleContext): Candidate[] {
  return [
    { address: ctx.walletId, label: "source" },
    ...(ctx.counterpartyRef ? [{ address: ctx.counterpartyRef, label: "counterparty" as const }] : []),
    ...(ctx.toWalletId ? [{ address: ctx.toWalletId, label: "destination" as const }] : []),
  ];
}

function flagDetail(candidate: Candidate, sanctioned: boolean, score: number): string {
  const reason = sanctioned ? "matched sanctions list (OFAC/EU/UN)" : `risk score ${score}/100 exceeds threshold`;
  return `${candidate.label} address ${candidate.address} flagged — ${reason}`;
}

// ─── Rule ─────────────────────────────────────────────────────────────────────

/**
 * Screens all addresses in the transaction via AMLBot.
 * Triggers CRITICAL if any address is sanctioned or has risk score >= 75.
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

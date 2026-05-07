import { randomUUID } from "node:crypto";
import { EnvConfig } from "../../config/env";
import type { IRiskAssessment, IRuleResultDoc } from "../../database/primary/models";
import { RiskAssessment, RiskLedger, RiskProfile } from "../../database/primary/models";
import {
  AlertLevel,
  type AssessCallbackPayload,
  AssessmentStatus,
  type AssessRequest,
  type AssessResponse,
  ProfileStatus,
  type RuleContext,
  RuleName,
  type TransactionType,
} from "../../types/risk";
import { logger } from "../../utils/logger";
import type { AmlBotScreenComplete } from "../amlbot";
import { sendAssessmentCallback } from "../callback";
import { sendEmail } from "../email";
import { sendSlackMessage } from "../slack";
import { evaluateAllRules } from "./rules";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function generateAssessmentId(): string {
  return `risk_${randomUUID().replace(/-/g, "").slice(0, 18)}`;
}

async function fetchOrCreateProfile(userRef: string, walletId: string) {
  const existing = await RiskProfile.findOne({ userRef });
  if (existing) return existing;

  const now = new Date();
  const profile = await RiskProfile.create({
    userRef,
    walletIds: [walletId],
    status: ProfileStatus.ACTIVE,
    onboardedAt: now,
    declaredMonthlyVolume: 0,
    thirtyDayAverage: 0,
    crossBorderBaseline: 0,
    crossBorderCount24h: 0,
    totalAssessments: 0,
    lastAssessedAt: now,
  });

  logger.info({ userRef, walletId }, "Risk profile created");
  return profile;
}

function updateProfileAsync(
  userRef: string,
  walletId: string,
  amount: number,
  existingWalletIds: string[],
  oldAverage: number,
): void {
  const walletIds = existingWalletIds.includes(walletId) ? existingWalletIds : [...existingWalletIds, walletId];
  const newAverage = oldAverage === 0 ? amount : Math.round(oldAverage * 0.97 + amount * 0.03);

  RiskProfile.updateOne(
    { userRef },
    {
      $set: { walletIds, lastAssessedAt: new Date(), thirtyDayAverage: newAverage },
      $inc: { totalAssessments: 1 },
    },
  ).catch((err) => logger.warn({ userRef, err }, "Profile update failed"));
}

/**
 * Write the immutable ledger record and remove the in-flight assessment.
 * Called exactly once per assessment — ledger is never modified after this.
 */
async function commitToLedger(
  assessment: IRiskAssessment,
  ruleResults: IRuleResultDoc[],
  triggeredRules: RuleName[],
  allow: boolean,
): Promise<void> {
  await RiskLedger.create({
    assessmentId: assessment.assessmentId,
    userRef: assessment.userRef,
    walletId: assessment.walletId,
    counterpartyId: assessment.counterpartyId,
    chain: assessment.chain,
    destinationWalletId: assessment.destinationWalletId,
    amount: assessment.amount,
    currency: assessment.currency,
    transactionType: assessment.transactionType,
    callbackUrl: assessment.callbackUrl,
    allow,
    triggeredRules,
    ruleResults,
    createdAt: assessment.createdAt,
  });

  await RiskAssessment.deleteOne({ assessmentId: assessment.assessmentId });
}

interface NotificationPayload {
  assessmentId: string;
  userRef: string;
  walletId: string;
  amount: number;
  currency: string;
  transactionType: TransactionType;
  chain: string;
  allow: boolean;
  triggeredRules: string[];
}

function dispatchNotifications(payload: NotificationPayload): void {
  const { assessmentId, userRef, walletId, amount, currency, transactionType, chain, allow, triggeredRules } = payload;
  const label = allow ? "Approved" : "Blocked";
  const ruleList = triggeredRules.length > 0 ? triggeredRules.map((r) => `• ${r}`).join("\n") : "• None";

  sendSlackMessage({
    channel: EnvConfig.SLACK_RISK_CHANNEL_ID,
    text: `🚨 AML Alert — ${label} | ${userRef} | ${assessmentId}`,
    attachments: [
      {
        color: "#FF4444",
        blocks: [
          {
            type: "section",
            fields: [
              { type: "mrkdwn", text: `*Assessment ID*\n\`${assessmentId}\`` },
              { type: "mrkdwn", text: `*User*\n\`${userRef}\`` },
              { type: "mrkdwn", text: `*Amount*\n${currency} ${amount.toLocaleString()}` },
              { type: "mrkdwn", text: `*Transaction Type*\n${transactionType}` },
              { type: "mrkdwn", text: `*Wallet*\n\`${walletId}\`` },
              { type: "mrkdwn", text: `*Chain*\n${chain || "—"}` },
            ],
          },
          { type: "divider" },
          {
            type: "section",
            text: { type: "mrkdwn", text: `*Triggered Rules*\n${ruleList}` },
          },
          {
            type: "context",
            elements: [{ type: "mrkdwn", text: `Cobolt Risk Engine  •  ${new Date().toUTCString()}` }],
          },
        ],
      },
    ],
  }).catch(() => {});

  sendEmail({
    email: "risk-team@company.com",
    subject: `[FLAGGED] Risk Assessment — ${assessmentId}`,
    content: [
      `Assessment ID    : ${assessmentId}`,
      `User             : ${userRef}`,
      `Wallet           : ${walletId}`,
      `Amount           : ${currency} ${amount.toLocaleString()}`,
      `Transaction Type : ${transactionType}`,
      `Chain            : ${chain || "—"}`,
      `Decision         : ${label}`,
      `Rules            : ${triggeredRules.join(", ") || "None"}`,
    ].join("\n"),
  }).catch(() => {});
}

// ─── Pipeline ────────────────────────────────────────────────────────────────

/**
 * Assessment pipeline:
 * 1. Create in-flight record in risk_assessments (mutable)
 * 2. Load or create risk profile
 * 3. Run all applicable AML rules in parallel
 * 4a. All sync → commit to risk_ledger (immutable) + delete assessment → return result
 * 4b. AMLBot deferred → store requestId + partial results → return { status: "pending" }
 *     Poller resolves via recheckAddress → finalizeAssessment
 *
 * Early-block: if any non-AMLBot rule fires, commit immediately without waiting for AMLBot.
 */
export async function assessTransaction(req: AssessRequest): Promise<AssessResponse> {
  const assessmentId = generateAssessmentId();
  const requestedAt = new Date();

  logger.info({ assessmentId, userRef: req.userRef, transactionType: req.transactionType }, "Assessment started");

  const assessment = await RiskAssessment.create({
    assessmentId,
    userRef: req.userRef,
    walletId: req.walletId,
    counterpartyId: req.counterpartyId ?? "",
    chain: req.chain ?? "",
    destinationWalletId: req.destinationWalletId ?? "",
    amount: req.amount,
    currency: req.currency,
    transactionType: req.transactionType,
    callbackUrl: req.callbackUrl,
    amlbotRequestId: "",
    completedRuleResults: [],
    createdAt: requestedAt,
  });

  const profile = await fetchOrCreateProfile(req.userRef, req.walletId);

  const ctx: RuleContext = {
    assessmentId,
    userRef: req.userRef,
    walletId: req.walletId,
    amount: req.amount,
    currency: req.currency,
    transactionType: req.transactionType,
    counterpartyId: req.counterpartyId ?? "",
    chain: req.chain ?? "",
    destinationWalletId: req.destinationWalletId ?? "",
    profile: {
      userRef: profile.userRef,
      walletIds: profile.walletIds,
      status: profile.status,
      onboardedAt: profile.onboardedAt,
      declaredMonthlyVolume: profile.declaredMonthlyVolume,
      thirtyDayAverage: profile.thirtyDayAverage,
      crossBorderBaseline: profile.crossBorderBaseline,
      crossBorderCount24h: profile.crossBorderCount24h,
      totalAssessments: profile.totalAssessments,
      lastAssessedAt: profile.lastAssessedAt,
    },
  };

  const ruleResults = await evaluateAllRules(ctx);

  const isProfileBlocked = ctx.profile.status === ProfileStatus.BLOCKED;
  const completedResults = ruleResults.filter((r) => !r.pending);
  const triggeredCompleted = completedResults.filter((r) => r.triggered).map((r) => r.rule);
  const pendingRule = ruleResults.find((r) => r.pending);

  // Early block: non-AMLBot rule fired or profile blocked — commit immediately.
  if (triggeredCompleted.length > 0 || isProfileBlocked) {
    await commitToLedger(assessment.toObject(), completedResults, triggeredCompleted, false);
    updateProfileAsync(req.userRef, req.walletId, req.amount, profile.walletIds, profile.thirtyDayAverage);
    dispatchNotifications({
      assessmentId,
      userRef: req.userRef,
      walletId: req.walletId,
      amount: req.amount,
      currency: req.currency,
      transactionType: req.transactionType as TransactionType,
      chain: req.chain ?? "",
      allow: false,
      triggeredRules: triggeredCompleted,
    });
    logger.info({ assessmentId, triggeredRules: triggeredCompleted }, "Assessment failed — early block");
    return { status: AssessmentStatus.FAILED, assessmentId, triggeredRules: triggeredCompleted as RuleName[] };
  }

  // AMLBot deferred — store requestId and partial results; poller will resolve.
  if (pendingRule) {
    await RiskAssessment.updateOne(
      { assessmentId },
      { $set: { amlbotRequestId: pendingRule.amlbotRequestId ?? "", completedRuleResults: completedResults } },
    );
    logger.info({ assessmentId, amlbotRequestId: pendingRule.amlbotRequestId }, "Assessment pending — AMLBot deferred");
    return { status: AssessmentStatus.PENDING, assessmentId };
  }

  // All rules completed synchronously.
  const triggeredRules = completedResults.filter((r) => r.triggered).map((r) => r.rule);
  const allow = triggeredRules.length === 0 && !isProfileBlocked;

  await commitToLedger(assessment.toObject(), completedResults, triggeredRules, allow);
  updateProfileAsync(req.userRef, req.walletId, req.amount, profile.walletIds, profile.thirtyDayAverage);

  if (!allow) {
    dispatchNotifications({
      assessmentId,
      userRef: req.userRef,
      walletId: req.walletId,
      amount: req.amount,
      currency: req.currency,
      transactionType: req.transactionType as TransactionType,
      chain: req.chain ?? "",
      allow,
      triggeredRules,
    });
  }

  const finalStatus = allow ? AssessmentStatus.SUCCESS : AssessmentStatus.FAILED;
  logger.info({ assessmentId, finalStatus, triggeredRules }, "Assessment complete");
  return { status: finalStatus, assessmentId, triggeredRules: triggeredRules as RuleName[] };
}

/**
 * Finalise a deferred assessment once the AMLBot poller has a complete result.
 * Appends the AMLBot rule outcome to the stored partial results, commits to ledger,
 * and fires the integrator's callback URL.
 * Called exclusively by the AMLBot poller — not exposed via HTTP.
 */
export async function finalizeAssessment(assessment: IRiskAssessment, amlResult: AmlBotScreenComplete): Promise<void> {
  const amlRuleResult: IRuleResultDoc = {
    rule: RuleName.SANCTIONED_WALLET,
    triggered: amlResult.flagged,
    alertLevel: AlertLevel.CRITICAL,
    detail: amlResult.flagged
      ? `Address flagged via AMLBot — ${amlResult.sanctioned ? "sanctions match (OFAC/EU/UN)" : `risk score ${amlResult.riskScore}/100 exceeds threshold`}`
      : `Address clean via AMLBot (risk score ${amlResult.riskScore}/100)`,
  };

  const allResults: IRuleResultDoc[] = [...assessment.completedRuleResults, amlRuleResult];
  const triggeredRules = allResults.filter((r) => r.triggered).map((r) => r.rule);
  const allow = triggeredRules.length === 0;
  const finalStatus = allow ? AssessmentStatus.SUCCESS : AssessmentStatus.FAILED;

  await commitToLedger(assessment, allResults, triggeredRules, allow);

  logger.info({ assessmentId: assessment.assessmentId, finalStatus, triggeredRules }, "Assessment finalised by poller");

  if (!allow) {
    dispatchNotifications({
      assessmentId: assessment.assessmentId,
      userRef: assessment.userRef,
      walletId: assessment.walletId,
      amount: assessment.amount,
      currency: assessment.currency,
      transactionType: assessment.transactionType as TransactionType,
      chain: assessment.chain,
      allow,
      triggeredRules,
    });
  }

  const callbackPayload: AssessCallbackPayload = {
    assessmentId: assessment.assessmentId,
    status: finalStatus,
    triggeredRules: triggeredRules as RuleName[],
  };

  sendAssessmentCallback(assessment.callbackUrl, callbackPayload).catch(() => {});
}

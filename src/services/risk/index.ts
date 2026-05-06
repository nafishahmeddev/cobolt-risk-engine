import { randomUUID } from "node:crypto";
import { EnvConfig } from "../../config/env";
import { RiskLedger, RiskProfile } from "../../database/primary/models";
import {
  type AssessRequest,
  type AssessResponse,
  ProfileStatus,
  type RuleContext,
  type RuleName,
  type TransactionType,
} from "../../types/risk";
import { logger } from "../../utils/logger";
import { sendEmail } from "../email";
import { sendSlackMessage } from "../slack";
import { evaluateAllRules } from "./rules";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function generateAssessId(): string {
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
    declaredTransactionSize: 0,
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

interface NotificationPayload {
  assessId: string;
  userRef: string;
  walletId: string;
  amount: number;
  currency: string;
  transactionType: TransactionType;
  chain: string;
  allow: boolean;
  triggeredRules: RuleName[];
}

function dispatchNotifications(payload: NotificationPayload): void {
  const { assessId, userRef, walletId, amount, currency, transactionType, chain, allow, triggeredRules } = payload;
  const status = allow ? "Approved" : "Blocked";
  const ruleList = triggeredRules.map((r) => `• ${r}`).join("\n");

  sendSlackMessage({
    channel: EnvConfig.SLACK_RISK_CHANNEL_ID,
    text: `🚨 AML Alert — ${status} | ${userRef} | ${assessId}`,
    attachments: [
      {
        color: "#FF4444",
        blocks: [
          // {
          //   type: "header",
          //   text: { type: "plain_text", text: `🚨 AML Alert — Transaction ${status}`, emoji: true },
          // },
          {
            type: "section",
            fields: [
              { type: "mrkdwn", text: `*Assessment ID*\n\`${assessId}\`` },
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
  }).catch(() => { });

  sendEmail({
    email: "risk-team@company.com",
    subject: `[FLAGGED] Risk Assessment — ${assessId}`,
    content: [
      `Assessment ID    : ${assessId}`,
      `User             : ${userRef}`,
      `Wallet           : ${walletId}`,
      `Amount           : ${currency} ${amount.toLocaleString()}`,
      `Transaction Type : ${transactionType}`,
      `Chain            : ${chain || "—"}`,
      `Decision         : ${status}`,
      `Rules            : ${triggeredRules.join(", ")}`,
    ].join("\n"),
  }).catch(() => { });
}

// ─── Pipeline ────────────────────────────────────────────────────────────────

/**
 * Full assessment pipeline:
 * 1. Load or create risk profile
 * 2. Run all applicable AML rules in parallel
 * 3. Decide: block if any rule triggered or profile is BLOCKED
 * 4. Persist immutable ledger record
 * 5. Update profile rolling averages (async, non-blocking)
 * 6. Dispatch Slack + email alerts if a rule triggered
 */
export async function assessTransaction(req: AssessRequest): Promise<AssessResponse> {
  const assessId = generateAssessId();

  logger.info({ assessId, userRef: req.userRef, transactionType: req.transactionType }, "Assessment started");

  const profile = await fetchOrCreateProfile(req.userRef, req.walletId);

  const ctx: RuleContext = {
    userRef: req.userRef,
    walletId: req.walletId,
    amount: req.amount,
    currency: req.currency,
    transactionType: req.transactionType,
    counterpartyRef: req.counterpartyRef ?? "",
    chain: req.chain ?? "",
    toWalletId: req.toWalletId ?? "",
    profile: {
      userRef: profile.userRef,
      walletIds: profile.walletIds,
      status: profile.status,
      onboardedAt: profile.onboardedAt,
      declaredTransactionSize: profile.declaredTransactionSize,
      thirtyDayAverage: profile.thirtyDayAverage,
      crossBorderBaseline: profile.crossBorderBaseline,
      crossBorderCount24h: profile.crossBorderCount24h,
      totalAssessments: profile.totalAssessments,
      lastAssessedAt: profile.lastAssessedAt,
    },
  };

  const ruleResults = await evaluateAllRules(ctx);
  const triggeredRules = ruleResults.filter((r) => r.triggered).map((r) => r.rule);

  const isProfileBlocked = ctx.profile.status === ProfileStatus.BLOCKED;
  const allow = triggeredRules.length === 0 && !isProfileBlocked;

  logger.info({ assessId, allow, triggeredRules }, "Assessment complete");

  await RiskLedger.create({
    assessId,
    userRef: req.userRef,
    walletId: req.walletId,
    counterpartyRef: req.counterpartyRef ?? "",
    chain: req.chain ?? "",
    toWalletId: req.toWalletId ?? "",
    amount: req.amount,
    currency: req.currency,
    transactionType: req.transactionType,
    allow,
    triggeredRules,
    ruleResults,
    createdAt: new Date(),
  });

  updateProfileAsync(req.userRef, req.walletId, req.amount, profile.walletIds, profile.thirtyDayAverage);

  if (triggeredRules.length > 0) {
    dispatchNotifications({
      assessId,
      userRef: req.userRef,
      walletId: req.walletId,
      amount: req.amount,
      currency: req.currency,
      transactionType: req.transactionType,
      chain: req.chain ?? "",
      allow,
      triggeredRules,
    });
  }

  return { assessId, allow, triggeredRules };
}

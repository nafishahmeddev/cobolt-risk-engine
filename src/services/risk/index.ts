import { randomUUID } from "node:crypto";
import { EnvConfig } from "../../config/env";
import type { IDeferredRule, IRuleResultDoc } from "../../database/primary/models";
import { RiskAssessment, RiskLedger, RiskProfile, RuleExecution } from "../../database/primary/models";
import {
  AlertLevel,
  type AssessCallbackPayload,
  AssessmentStatus,
  type AssessRequest,
  type AssessResponse,
  ProfileStatus,
  type RuleContext,
  type RuleName,
  type RuleResult,
  type TransactionType,
} from "../../types/risk";
import { logger } from "../../utils/logger";
import { sendAssessmentCallback } from "../callback";
import { sendEmail } from "../email";
import { sendSlackMessage } from "../slack";
import { evaluateAllRules, getRulesForType } from "./rules";

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
      $set: {
        walletIds,
        lastAssessedAt: new Date(),
        thirtyDayAverage: newAverage,
      },
      $inc: { totalAssessments: 1 },
    },
  ).catch((err) => logger.warn({ userRef, err }, "Profile update failed"));
}

async function commitToLedger(
  assessmentId: string,
  ruleResults: IRuleResultDoc[],
  triggeredRules: RuleName[],
  allow: boolean,
): Promise<void> {
  const assessment = await RiskAssessment.findOne({ assessmentId });
  if (!assessment) {
    logger.warn({ assessmentId }, "Assessment already finalised — skipping ledger commit");
    return;
  }

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

  await RiskAssessment.deleteOne({ assessmentId });
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
              {
                type: "mrkdwn",
                text: `*Amount*\n${currency} ${amount.toLocaleString()}`,
              },
              {
                type: "mrkdwn",
                text: `*Transaction Type*\n${transactionType}`,
              },
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
            elements: [
              {
                type: "mrkdwn",
                text: `Cobolt Risk Engine  •  ${new Date().toUTCString()}`,
              },
            ],
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

export async function assessTransaction(req: AssessRequest): Promise<AssessResponse> {
  const assessmentId = generateAssessmentId();
  const startedAt = new Date();

  logger.info({ assessmentId, userRef: req.userRef, transactionType: req.transactionType }, "Assessment started");

  // 1. Create in-flight assessment
  await RiskAssessment.create({
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
    ruleResults: [],
    deferredRules: [],
    createdAt: startedAt,
  });

  // 2. Load or create risk profile
  const profile = await fetchOrCreateProfile(req.userRef, req.walletId);
  const isProfileBlocked = profile.status === ProfileStatus.BLOCKED;

  // 3. Build rule context from profile snapshot
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

  // 4. Create RuleExecution docs BEFORE running rules (state: pending → tracks lifecycle)
  const applicableRules = getRulesForType(ctx.transactionType);

  await RuleExecution.insertMany(
    applicableRules.map(({ name }) => ({
      executionId: `${assessmentId}_${name}`,
      assessmentId,
      rule: name,
      state: "pending" as const,
      triggered: false,
      alertLevel: "medium" as const,
      detail: "",
      startedAt,
    })),
  );

  // 5. Run all applicable rules in parallel
  let ruleResults: RuleResult[];
  try {
    ruleResults = await evaluateAllRules(ctx);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ assessmentId, err }, "Assessment failed — rule evaluation threw");

    // Mark all pending rule executions as failed
    await RuleExecution.updateMany(
      { assessmentId, state: "pending" },
      {
        $set: {
          state: "failed",
          triggered: false,
          alertLevel: AlertLevel.MEDIUM,
          detail: message,
          completedAt: new Date(),
        },
      },
    );

    return { status: AssessmentStatus.FAILED, assessmentId };
  }

  // 6. Process results: update RuleExecution, separate sync vs deferred
  const completedResults: IRuleResultDoc[] = [];
  const deferredRules: IDeferredRule[] = [];
  const updates: Promise<unknown>[] = [];

  for (const result of ruleResults) {
    const executionId = `${assessmentId}_${result.rule}`;

    if (result.deferred) {
      deferredRules.push({
        rule: result.rule,
        metadata: result.metadata ?? {},
      });
      updates.push(
        RuleExecution.updateOne(
          { executionId },
          {
            $set: {
              state: "deferred",
              metadata: result.metadata,
            },
          },
        ),
      );
    } else {
      completedResults.push({
        rule: result.rule,
        triggered: result.triggered,
        alertLevel: result.alertLevel,
        detail: result.detail,
      });
      updates.push(
        RuleExecution.updateOne(
          { executionId },
          {
            $set: {
              state: "completed",
              triggered: result.triggered,
              alertLevel: result.alertLevel,
              detail: result.detail,
              completedAt: new Date(),
            },
          },
        ),
      );
    }
  }

  // 7. Persist assessment rule results and deferred state
  updates.push(RiskAssessment.updateOne({ assessmentId }, { $set: { ruleResults: completedResults, deferredRules } }));
  await Promise.all(updates);

  // 8. Early block: profile blocked or any sync rule triggered
  const triggeredSync = completedResults.filter((r) => r.triggered).map((r) => r.rule);

  if (isProfileBlocked || triggeredSync.length > 0) {
    await commitToLedger(assessmentId, completedResults, triggeredSync, false);
    updateProfileAsync(req.userRef, req.walletId, req.amount, profile.walletIds, profile.thirtyDayAverage);
    dispatchNotifications({
      assessmentId,
      userRef: req.userRef,
      walletId: req.walletId,
      amount: req.amount,
      currency: req.currency,
      transactionType: req.transactionType,
      chain: req.chain ?? "",
      allow: false,
      triggeredRules: triggeredSync,
    });
    logger.info({ assessmentId, triggeredRules: triggeredSync }, "Assessment finalised — blocked");
    return {
      status: AssessmentStatus.SUCCESS,
      assessmentId,
      allow: false,
      triggeredRules: triggeredSync,
    };
  }

  // 9. Deferred rules exist — return PENDING for cron resolution
  if (deferredRules.length > 0) {
    logger.info(
      {
        assessmentId,
        deferredRules: deferredRules.map((d) => d.rule),
      },
      "Assessment pending — deferred rules require async resolution",
    );
    return { status: AssessmentStatus.PENDING, assessmentId };
  }

  // 10. All clear: no triggers, profile active, all rules sync
  await commitToLedger(assessmentId, completedResults, [], true);
  updateProfileAsync(req.userRef, req.walletId, req.amount, profile.walletIds, profile.thirtyDayAverage);

  logger.info({ assessmentId }, "Assessment finalised — allowed");
  return {
    status: AssessmentStatus.SUCCESS,
    assessmentId,
    allow: true,
    triggeredRules: [],
  };
}

/**
 * Finalise a deferred assessment once all deferred rules are resolved.
 * Called by the generic cron job — reads assessment from DB, commits to ledger,
 * dispatches notifications, and sends the callback to the integrator.
 */
export async function finalizeAssessment(assessmentId: string): Promise<void> {
  const assessment = await RiskAssessment.findOne({ assessmentId });
  if (!assessment) {
    logger.warn({ assessmentId }, "finalizeAssessment: already finalised");
    return;
  }

  const triggeredRules = assessment.ruleResults.filter((r) => r.triggered).map((r) => r.rule);
  const allow = triggeredRules.length === 0;

  await commitToLedger(assessmentId, assessment.ruleResults, triggeredRules, allow);

  // Load profile for accurate wallet list and rolling average
  const profile = await RiskProfile.findOne({ userRef: assessment.userRef });
  if (profile) {
    updateProfileAsync(
      assessment.userRef,
      assessment.walletId,
      assessment.amount,
      profile.walletIds,
      profile.thirtyDayAverage,
    );
  }

  if (!allow) {
    dispatchNotifications({
      assessmentId,
      userRef: assessment.userRef,
      walletId: assessment.walletId,
      amount: assessment.amount,
      currency: assessment.currency,
      transactionType: assessment.transactionType,
      chain: assessment.chain,
      allow,
      triggeredRules,
    });
  }

  logger.info({ assessmentId, allow, triggeredRules }, "Assessment finalised by cron");

  const callbackPayload: AssessCallbackPayload = {
    assessmentId,
    status: AssessmentStatus.SUCCESS,
    allow,
    triggeredRules,
  };

  sendAssessmentCallback(assessment.callbackUrl, callbackPayload).catch(() => {});
}

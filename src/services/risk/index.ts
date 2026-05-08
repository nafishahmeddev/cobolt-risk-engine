import { randomUUID } from "node:crypto";
import { EnvConfig } from "../../config/env";
import type { IRuleResultDoc } from "../../database/primary/models";
import { RiskAssessment, RiskLedger, RiskProfile } from "../../database/primary/models";
import {
  type AssessCallbackPayload,
  type AssessRequest,
  type AssessResponse,
  type RiskProfileData,
  type RuleContext,
  type RuleName,
  type RuleResult,

  AlertLevel,
  AssessmentStatus,
  ProfileStatus,
  RuleResultStatus,
  TransactionType,
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
  }).catch(() => { });

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
  }).catch(() => { });
}

// ─── Context builder ─────────────────────────────────────────────────────────

function buildContext(assessmentId: string, req: AssessRequest, profile: RiskProfileData): RuleContext {
  const base = {
    assessmentId,
    userRef: req.userRef,
    walletId: req.walletId,
    amount: req.amount,
    currency: req.currency,
    counterpartyId: req.counterpartyId ?? "",
    profile,
  };

  switch (req.transactionType) {
    case TransactionType.DEPOSIT:
      return { ...base, transactionType: TransactionType.DEPOSIT };
    case TransactionType.BUY_CRYPTO:
      return {
        ...base,
        transactionType: TransactionType.BUY_CRYPTO,
        chain: req.chain,
        destinationWalletId: req.destinationWalletId,
      };
    case TransactionType.WITHDRAW_CRYPTO:
      return {
        ...base,
        transactionType: TransactionType.WITHDRAW_CRYPTO,
        chain: req.chain,
        destinationWalletId: req.destinationWalletId,
      };
  }
}

// ─── Pipeline ────────────────────────────────────────────────────────────────

export async function assessTransaction(req: AssessRequest): Promise<AssessResponse> {
  const assessmentId = generateAssessmentId();
  const startedAt = new Date();

  logger.info({ assessmentId, userRef: req.userRef, transactionType: req.transactionType }, "Assessment started");

  // Normalise crypto-only fields for the assessment record
  const chain = req.transactionType === TransactionType.DEPOSIT ? "" : req.chain;
  const destinationWalletId = req.transactionType === TransactionType.DEPOSIT ? "" : req.destinationWalletId;

  const applicableRules = getRulesForType(req.transactionType);

  // 1. Create in-flight assessment
  await RiskAssessment.create({
    assessmentId,
    userRef: req.userRef,
    walletId: req.walletId,
    counterpartyId: req.counterpartyId ?? "",
    chain,
    destinationWalletId,
    amount: req.amount,
    currency: req.currency,
    transactionType: req.transactionType,
    callbackUrl: req.callbackUrl,
    ruleResults: applicableRules.map(({ name }) => ({
      rule: name,
      status: RuleResultStatus.PENDING,
      triggered: false,
      alertLevel: AlertLevel.MEDIUM,
      detail: "",
      metadata: {},
      startedAt,
    })),
    createdAt: startedAt,
  });

  // 2. Load or create risk profile
  const profile = await fetchOrCreateProfile(req.userRef, req.walletId);
  const isProfileBlocked = profile.status === ProfileStatus.BLOCKED;

  // 3. Build rule context — discriminated by transaction type
  const profileSnapshot = {
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
  };

  const ctx = buildContext(assessmentId, req, profileSnapshot);
  // 5. Run all applicable rules in parallel
  let ruleResults: RuleResult[];
  try {
    ruleResults = await evaluateAllRules(ctx);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ assessmentId, err }, "Assessment failed — rule evaluation threw");

    await RiskAssessment.updateOne(
      { assessmentId, "ruleResults.rule": { $in: applicableRules.map(({ name }) => name) } },
      {
        $set: {
          status: AssessmentStatus.FAILED,
          "ruleResults.$..status": RuleResultStatus.FAILED,
          "ruleResults.$..triggered": false,
          "ruleResults.$..alertLevel": AlertLevel.MEDIUM,
          "ruleResults.$..detail": message,
          "ruleResults.$..completedAt": new Date(),
        },
      },
    );
    return { status: AssessmentStatus.FAILED, assessmentId };
  }

  // 6. Process results: build unified ruleResults with status, update RuleExecution
  const assessmentResults: IRuleResultDoc[] = [];
  let hasPending = false;

  for (const result of ruleResults) {
    if (result.deferred) {
      hasPending = true;
      assessmentResults.push({
        rule: result.rule,
        status: RuleResultStatus.DEFERRED,
        triggered: false,
        alertLevel: result.alertLevel,
        detail: result.detail,
        metadata: result.metadata ?? {},
      });
    } else {
      assessmentResults.push({
        rule: result.rule,
        status: RuleResultStatus.COMPLETED,
        triggered: result.triggered,
        alertLevel: result.alertLevel,
        detail: result.detail,
        completedAt: new Date(),
      });

    }
  }
  // 7. Persist assessment ruleResults
  await RiskAssessment.updateOne({ assessmentId }, { $set: { ruleResults: assessmentResults } });

  // 8. Early block: profile blocked or any completed rule triggered
  const triggeredSync = assessmentResults.filter((r) => r.status === RuleResultStatus.COMPLETED && r.triggered).map((r) => r.rule);

  if ((isProfileBlocked || triggeredSync.length > 0) && !hasPending) {
    const committed = assessmentResults.filter((r) => r.status === RuleResultStatus.COMPLETED);
    await commitToLedger(assessmentId, committed, triggeredSync, false);
    updateProfileAsync(req.userRef, req.walletId, req.amount, profile.walletIds, profile.thirtyDayAverage);
    dispatchNotifications({
      assessmentId,
      userRef: req.userRef,
      walletId: req.walletId,
      amount: req.amount,
      currency: req.currency,
      transactionType: req.transactionType,
      chain,
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

  // 9. Pending rules exist — return PENDING for cron resolution
  if (hasPending) {
    logger.info(
      {
        assessmentId,
        deferredRules: assessmentResults.filter((r) => r.status === RuleResultStatus.DEFERRED).map((r) => r.rule),
      },
      "Assessment deferred — rules require async resolution",
    );
    return { status: AssessmentStatus.PENDING, assessmentId };
  }

  // 10. All clear: no triggers, profile active, all rules completed
  await commitToLedger(assessmentId, assessmentResults, [], true);
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

  sendAssessmentCallback(assessment.callbackUrl, callbackPayload).catch(() => { });
}

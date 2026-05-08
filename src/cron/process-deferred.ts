import type { IRuleResultDoc } from "../database/primary/models";
import { RiskAssessment, RuleExecution } from "../database/primary/models";
import { finalizeAssessment } from "../services/risk";
import { getDeferredResolver } from "../services/risk/rules/registry";
import { logger } from "../utils/logger";

const BATCH_LIMIT = 50;

async function resolvePendingRule(assessmentId: string, ruleResult: IRuleResultDoc): Promise<boolean> {
  const resolver = getDeferredResolver(ruleResult.rule);

  if (!resolver) {
    // No resolver registered — rule resolves externally (webhook/callback).
    // Cron skips it; the external service will call back to resolve.
    return false;
  }

  const outcome = await resolver(ruleResult.metadata ?? {});

  if (!outcome.completed) {
    return false;
  }

  // Update the rule result entry in-place: pending → completed
  await RiskAssessment.updateOne(
    { assessmentId, "ruleResults.rule": ruleResult.rule, "ruleResults.status": "pending" },
    {
      $set: {
        "ruleResults.$.status": "completed",
        "ruleResults.$.triggered": outcome.result.triggered,
        "ruleResults.$.alertLevel": outcome.result.alertLevel,
        "ruleResults.$.detail": outcome.result.detail,
      },
      $unset: { "ruleResults.$.metadata": "" },
    },
  );

  // Update RuleExecution record
  await RuleExecution.updateOne(
    { executionId: `${assessmentId}_${ruleResult.rule}` },
    {
      $set: {
        state: "completed",
        triggered: outcome.result.triggered,
        alertLevel: outcome.result.alertLevel,
        detail: outcome.result.detail,
        completedAt: new Date(),
      },
    },
  );

  return true;
}

export async function tick(): Promise<void> {
  const pending = await RiskAssessment.find({ "ruleResults.status": "pending" }, null, {
    sort: { createdAt: 1 },
    limit: BATCH_LIMIT,
  }).lean();

  if (pending.length === 0) return;

  logger.info({ count: pending.length }, "process-deferred: processing pending assessments");

  for (const assessment of pending) {
    const pendingRules = (assessment.ruleResults as IRuleResultDoc[]).filter((r) => r.status === "pending");

    try {
      let allResolved = true;

      for (const ruleResult of pendingRules) {
        const resolved = await resolvePendingRule(assessment.assessmentId, ruleResult);
        if (!resolved) allResolved = false;
      }

      if (allResolved) {
        await finalizeAssessment(assessment.assessmentId);
        logger.info({ assessmentId: assessment.assessmentId }, "process-deferred: assessment finalised");
      }
    } catch (err) {
      logger.warn(
        { assessmentId: assessment.assessmentId, err },
        "process-deferred: error processing assessment — skipping",
      );
    }
  }
}

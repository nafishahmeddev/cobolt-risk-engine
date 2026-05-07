import type { IDeferredRule } from "../database/primary/models";
import { RiskAssessment, RuleExecution } from "../database/primary/models";
import { finalizeAssessment } from "../services/risk";
import { getDeferredResolver } from "../services/risk/rules/registry";
import { logger } from "../utils/logger";

const BATCH_LIMIT = 50;

async function resolveDeferredRule(assessmentId: string, deferred: IDeferredRule): Promise<boolean> {
  const resolver = getDeferredResolver(deferred.rule);

  if (!resolver) {
    // No resolver registered — rule resolves externally (webhook/callback).
    // Cron skips it; the external service will call back to resolve.
    return false;
  }

  const outcome = await resolver(deferred.metadata);

  if (!outcome.completed) {
    return false;
  }

  // Remove from deferredRules, add result to ruleResults
  await RiskAssessment.updateOne(
    { assessmentId },
    {
      $pull: { deferredRules: { rule: deferred.rule } },
      $push: { ruleResults: outcome.result },
    },
  );

  // Update RuleExecution record
  await RuleExecution.updateOne(
    { executionId: `${assessmentId}_${deferred.rule}` },
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
  const pending = await RiskAssessment.find({ "deferredRules.0": { $exists: true } }, null, {
    sort: { createdAt: 1 },
    limit: BATCH_LIMIT,
  }).lean();

  if (pending.length === 0) return;

  logger.info({ count: pending.length }, "process-deferred: processing pending assessments");

  for (const assessment of pending) {
    const deferredRules = assessment.deferredRules as IDeferredRule[];

    try {
      let allResolved = true;

      for (const deferred of deferredRules) {
        const resolved = await resolveDeferredRule(assessment.assessmentId, deferred);
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

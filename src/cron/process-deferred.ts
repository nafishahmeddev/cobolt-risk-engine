import { RuleResultStatus } from "@app/types/risk";
import type { IRuleResultDoc } from "../database/primary/models";
import { RiskAssessment } from "../database/primary/models";
import { finalizeAssessment } from "../services/risk";
import { getDeferredResolver } from "../services/risk/rules/registry";
import { logger } from "../utils/logger";

const BATCH_LIMIT = 50;

async function resolveDeferredRule(assessmentId: string, ruleResult: IRuleResultDoc): Promise<boolean> {
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
    { assessmentId, "ruleResults.rule": ruleResult.rule, "ruleResults.status": RuleResultStatus.DEFERRED },
    {
      $set: {
        "ruleResults.$.status": RuleResultStatus.COMPLETED,
        "ruleResults.$.triggered": outcome.result.triggered,
        "ruleResults.$.alertLevel": outcome.result.alertLevel,
        "ruleResults.$.detail": outcome.result.detail,
        "ruleResults.$.completedAt": new Date(),
      },
      $unset: { "ruleResults.$.metadata": "" },
    },
  );

  return true;
}

export async function tick(): Promise<void> {
  const pending = await RiskAssessment.find({ "ruleResults.status": RuleResultStatus.DEFERRED }, null, {
    sort: { createdAt: 1 },
    limit: BATCH_LIMIT,
  }).lean();

  if (pending.length === 0) return;

  logger.info({ count: pending.length }, "process-deferred: processing pending assessments");

  for (const assessment of pending) {
    const deferredRules = (assessment.ruleResults as IRuleResultDoc[]).filter(
      (r) => r.status === RuleResultStatus.DEFERRED,
    );

    try {
      let allResolved = true;

      for (const ruleResult of deferredRules) {
        const resolved = await resolveDeferredRule(assessment.assessmentId, ruleResult);
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

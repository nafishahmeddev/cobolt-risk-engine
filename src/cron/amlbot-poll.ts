import { RiskAssessment } from "../database/primary/models";
import { recheckAddress } from "../services/amlbot";
import { finalizeAssessment } from "../services/risk";
import { logger } from "../utils/logger";

const BATCH_LIMIT = 50;

async function processOne(assessmentId: string, amlbotRequestId: string): Promise<boolean> {
  const result = await recheckAddress(amlbotRequestId);
  if (result.pending) return false;

  const assessment = await RiskAssessment.findOne({ assessmentId });
  if (!assessment) return false;

  await finalizeAssessment(assessment.toObject(), result);
  return true;
}

export async function tick(): Promise<void> {
  const pending = await RiskAssessment.find(
    { amlbotRequestId: { $ne: "" } },
    { assessmentId: 1, amlbotRequestId: 1 },
    { sort: { createdAt: 1 }, limit: BATCH_LIMIT },
  ).lean();

  if (pending.length === 0) return;

  logger.info({ count: pending.length }, "amlbot-poll: processing pending assessments");

  for (const { assessmentId, amlbotRequestId } of pending) {
    try {
      const finalised = await processOne(assessmentId, amlbotRequestId);
      if (finalised) logger.info({ assessmentId }, "amlbot-poll: assessment finalised");
    } catch (err) {
      logger.warn({ assessmentId, amlbotRequestId, err }, "amlbot-poll: error — skipping to next");
    }
  }
}

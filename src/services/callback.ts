import type { AssessCallbackPayload } from "../types/assesment";
import { logger } from "../utils/logger";
import { getTrace } from "../utils/trace";

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1_000;

/**
 * POST the assessment result to the client's callback URL.
 * Retries up to `MAX_RETRIES` times with a 1-second delay between attempts.
 * Logs on failure but never throws — callers should treat callbacks as
 * best-effort notifications.
 */
export async function sendAssessmentCallback(url: string, payload: AssessCallbackPayload): Promise<void> {
  const { requestId } = getTrace();

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10_000),
      });

      if (response.ok) {
        logger.info({ requestId, assessmentId: payload.assessmentId, url, attempt }, "Assessment callback delivered");
        return;
      }

      const body = await response.text().catch(() => "unreadable");
      logger.warn(
        { requestId, assessmentId: payload.assessmentId, url, attempt, status: response.status, body },
        "Assessment callback returned non-2xx",
      );
    } catch (err) {
      logger.warn(
        { requestId, assessmentId: payload.assessmentId, url, attempt, err },
        "Assessment callback request failed",
      );
    }

    if (attempt < MAX_RETRIES) {
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    }
  }

  logger.error(
    { requestId, assessmentId: payload.assessmentId, url, maxRetries: MAX_RETRIES },
    "Assessment callback failed after all retries",
  );
}

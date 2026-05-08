import { EnvConfig } from "../config/env";
import { logger } from "../utils/logger";
import { getTrace } from "../utils/trace";

/** AMLBot returned a result synchronously. */
export interface AmlBotScreenComplete {
  pending: false;
  flagged: boolean;
  sanctioned: boolean;
  riskScore: number;
}

/** AMLBot is still processing — poll via `recheckAddress` using `requestId`. */
export interface AmlBotScreenPending {
  pending: true;
  /** AMLBot's internal request ID — pass to `recheckAddress` to poll for the result. */
  requestId: string;
}

export type AmlBotScreenResult = AmlBotScreenComplete | AmlBotScreenPending;

interface AmlBotResponse {
  /** AMLBot's internal request identifier. Present in both initial and recheck responses. */
  request_id: string;
  score: number;
  sanctioned: boolean;
  /** `"in_progress"` while processing, `"complete"` when result is ready. */
  status: "in_progress" | "complete";
}

function parseResponse(data: AmlBotResponse): AmlBotScreenResult {
  if (data.status === "in_progress") {
    return { pending: true, requestId: data.request_id };
  }

  return {
    pending: false,
    flagged: data.sanctioned || data.score >= 75,
    sanctioned: data.sanctioned,
    riskScore: data.score,
  };
}

/**
 * Submit a wallet address to AMLBot for AML screening.
 * Returns immediately if AMLBot has a cached result, or `{ pending: true, requestId }`
 * when processing is deferred — poll with `recheckAddress` until complete.
 * In development and staging, returns a clean synchronous mock.
 */
export async function screenAddress(address: string, coin: string): Promise<AmlBotScreenResult> {
  const { requestId } = getTrace();

  if (EnvConfig.NODE_ENV !== "production") {
    logger.debug({ requestId, address, coin }, "AMLBot mock — returning clean result");
    return { pending: false, flagged: false, sanctioned: false, riskScore: 0 };
  }

  const response = await fetch(`${EnvConfig.AMLBOT_API_URL}/check/`, {
    method: "POST",
    headers: {
      Authorization: `Token ${EnvConfig.AMLBOT_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ address, coin }),
  });

  if (!response.ok) {
    const body = await response.text();
    logger.error({ requestId, address, coin, status: response.status, body }, "AMLBot screenAddress failed");
    throw new Error(`AMLBot ${response.status}: ${body}`);
  }

  const data = (await response.json()) as AmlBotResponse;
  logger.debug({ requestId, address, coin, amlStatus: data.status }, "AMLBot screenAddress response");
  return parseResponse(data);
}

/**
 * Poll AMLBot for the result of a previously submitted check.
 * Returns the same shape as `screenAddress` — caller retries until `pending` is false.
 * In development and staging, returns a clean synchronous mock.
 */
export async function recheckAddress(amlbotRequestId: string): Promise<AmlBotScreenResult> {
  const { requestId } = getTrace();

  if (EnvConfig.NODE_ENV !== "production") {
    logger.debug({ requestId, amlbotRequestId }, "AMLBot recheck mock — returning clean result");
    return { pending: false, flagged: false, sanctioned: false, riskScore: 0 };
  }

  const response = await fetch(`${EnvConfig.AMLBOT_API_URL}/check/${amlbotRequestId}/`, {
    method: "GET",
    headers: { Authorization: `Token ${EnvConfig.AMLBOT_API_KEY}` },
  });

  if (!response.ok) {
    const body = await response.text();
    logger.error({ requestId, amlbotRequestId, status: response.status, body }, "AMLBot recheckAddress failed");
    throw new Error(`AMLBot recheck ${response.status}: ${body}`);
  }

  const data = (await response.json()) as AmlBotResponse;
  logger.debug({ requestId, amlbotRequestId, amlStatus: data.status }, "AMLBot recheck response");
  return parseResponse(data);
}

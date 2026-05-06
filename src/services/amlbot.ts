import { EnvConfig } from "../config/env";
import { logger } from "../utils/logger";
import { getTrace } from "../utils/trace";

export interface AmlBotScreenResult {
  flagged: boolean;
  sanctioned: boolean;
  riskScore: number;
}

interface AmlBotResponse {
  risk_score: number;
  sanctioned: boolean;
  status: string;
}

/**
 * Screen a single wallet address against AMLBot's sanctions and blacklist database.
 * Throws on HTTP error — caller decides how to handle.
 * In development and staging, returns a clean mock result without hitting the API.
 */
export async function screenAddress(address: string, coin: string): Promise<AmlBotScreenResult> {
  const { requestId } = getTrace();

  if (EnvConfig.NODE_ENV !== "production") {
    logger.debug({ requestId, address, coin }, "AMLBot mock — returning clean result");
    return { flagged: false, sanctioned: false, riskScore: 0 };
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
    logger.error({ requestId, address, coin, status: response.status, body }, "AMLBot request failed");
    throw new Error(`AMLBot ${response.status}: ${body}`);
  }

  const data = (await response.json()) as AmlBotResponse;

  logger.debug(
    { requestId, address, coin, riskScore: data.risk_score, sanctioned: data.sanctioned },
    "AMLBot screen complete",
  );

  return {
    flagged: data.sanctioned || data.risk_score >= 75,
    sanctioned: data.sanctioned,
    riskScore: data.risk_score,
  };
}

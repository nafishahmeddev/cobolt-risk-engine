import type { KnownBlock } from "@slack/types/dist/block-kit/blocks";
import { WebClient } from "@slack/web-api";
import type { ChatPostMessageArguments } from "@slack/web-api/dist/types/request/chat";
import { EnvConfig } from "../config/env";
import { logger } from "../utils/logger";
import { getTrace } from "../utils/trace";

type SlackMessage = {
  channel: string;
  text: string;
  blocks?: KnownBlock[];
};

let client: WebClient | null = null;

function getClient(): WebClient {
  if (!client) {
    client = new WebClient(EnvConfig.SLACK_BOT_TOKEN, {
      timeout: 10000,
      rejectRateLimitedCalls: true,
    });
  }
  return client;
}

export async function sendSlackMessage(message: SlackMessage): Promise<void> {
  const { requestId } = getTrace();

  try {
    const payload: ChatPostMessageArguments = {
      channel: message.channel,
      text: message.text,
      ...(message.blocks && { blocks: message.blocks }),
    };

    await getClient().chat.postMessage(payload);

    logger.info({ requestId, channel: message.channel }, "Slack message sent");
  } catch (err) {
    logger.error({ requestId, err, channel: message.channel }, "Failed to send Slack message");
  }
}

export function formatSlackCodeBlock(code: string, language?: string): string {
  const lang = language ?? "";
  return `\`\`\`${lang}\n${code}\n\`\`\``;
}

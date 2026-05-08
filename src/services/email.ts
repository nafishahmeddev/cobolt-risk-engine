import fs from "node:fs";
import path from "node:path";
import axios from "axios";
import FormData from "form-data";
import { EnvConfig } from "../config/env";
import { logger } from "../utils/logger";
import { getTrace } from "../utils/trace";

type EmailPayload = {
  email: string;
  subject: string;
  content: string;
  attachment?: string;
  html?: string;
  bcc?: string;
  cc?: string;
};

type EmailResponse = {
  success: boolean;
  messageId?: string;
};

export async function sendEmail(data: EmailPayload): Promise<EmailResponse | null> {
  if (EnvConfig.NODE_ENV === "development") {
    logger.info({ data }, "Email sent");
    return null;
  }

  const { requestId } = getTrace();

  const form = new FormData();

  form.append("from", "SARRAF <noreply@sarrafapp.com>");
  form.append("to", data.email);
  form.append("subject", data.subject);
  form.append("text", data.content);

  if (data.html) form.append("html", data.html);
  if (data.cc) form.append("cc", data.cc);
  if (data.bcc) form.append("bcc", data.bcc);
  if (data.attachment) {
    form.append("attachment", fs.createReadStream(data.attachment), {
      filename: path.basename(data.attachment),
    });
  }

  try {
    const { data: body } = await axios.post<EmailResponse>(EnvConfig.EMAIL_API_URL, form, {
      headers: {
        ...form.getHeaders(),
        Authorization: `Bearer ${EnvConfig.EMAIL_API_KEY}`,
      },
      timeout: 30000,
    });

    logger.info({ requestId, to: data.email, subject: data.subject }, "Email sent");

    return body;
  } catch (err) {
    logger.error({ requestId, err, to: data.email, subject: data.subject }, "Failed to send email");
    return null;
  }
}

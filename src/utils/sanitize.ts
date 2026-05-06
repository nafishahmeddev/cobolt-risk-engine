const SENSITIVE_KEYS = new Set([
  "password",
  "secret",
  "token",
  "apiKey",
  "api_key",
  "apikey",
  "authorization",
  "auth",
  "accessToken",
  "access_token",
  "refreshToken",
  "refresh_token",
  "slackBotToken",
  "slack_bot_token",
  "emailApiKey",
  "email_api_key",
  "mongodbUri",
  "mongodb_uri",
  "creditCard",
  "credit_card",
  "ssn",
  "phone",
]);

const SENSITIVE_PATTERNS = [/^xox[baprs]-/, /^Bearer\s+/, /^gh[ps]_[a-zA-Z0-9]{36,}$/, /^sk-[a-zA-Z0-9]{32,}$/];

function isSensitiveKey(key: string): boolean {
  const lower = key.toLowerCase().replace(/[-_]/g, "");
  return SENSITIVE_KEYS.has(lower) || SENSITIVE_KEYS.has(key);
}

function isSensitiveValue(value: unknown): boolean {
  if (typeof value !== "string") return false;
  return SENSITIVE_PATTERNS.some((p) => p.test(value));
}

export function sanitize<T>(data: T): T {
  if (data === null || data === undefined) return data;

  if (Array.isArray(data)) {
    return data.map(sanitize) as T;
  }

  if (typeof data === "object") {
    const sanitized: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      if (isSensitiveKey(key)) {
        sanitized[key] = "[REDACTED]";
      } else if (typeof value === "object" && value !== null) {
        sanitized[key] = sanitize(value);
      } else if (isSensitiveValue(value)) {
        sanitized[key] = "[REDACTED]";
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized as T;
  }

  return data;
}

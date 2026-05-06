import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "staging", "production"]),

  HTTP_PORT: z.coerce.number().int().positive(),
  HTTP_HOST: z.string().min(1),

  SLACK_BOT_TOKEN: z.string().min(1),
  SLACK_RISK_CHANNEL_ID: z.string().min(1),

  EMAIL_API_URL: z.url(),
  EMAIL_API_KEY: z.string().min(1),

  MONGODB_URI: z.url(),

  APP_API_KEY: z.string().min(1),

  AMLBOT_API_URL: z.url(),
  AMLBOT_API_KEY: z.string().min(1),
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
  const issues = result.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");

  console.error(`Invalid environment variables:\n${issues}`);
  process.exit(1);
}

export const EnvConfig = result.data;

import pino from "pino";
import { EnvConfig } from "../config/env";

const isDev = EnvConfig.NODE_ENV !== "production";

export const logger = pino({
  level: isDev ? "debug" : "info",
  ...(isDev && {
    transport: {
      target: "pino-pretty",
      options: {
        colorize: true,
        ignore: "pid,hostname",
        translateTime: "SYS:yyyy-mm-dd HH:MM:ss.l",
      },
    },
  }),
});

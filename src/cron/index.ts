import cron from "node-cron";
import { logger } from "../utils/logger";
import { tick as amlbotPollTick } from "./amlbot-poll";

interface CronJob {
  name: string;
  schedule: string;
  tick: () => Promise<void>;
}

/** Register all cron jobs here. One entry per job. */
const JOBS: CronJob[] = [
  {
    name: "amlbot-poll",
    schedule: "*/30 * * * * *",
    tick: amlbotPollTick,
  },
];

const tasks = new Map<string, ReturnType<typeof cron.schedule>>();

export function startAllCrons(): void {
  for (const job of JOBS) {
    const task = cron.schedule(job.schedule, job.tick);
    tasks.set(job.name, task);
    logger.info({ name: job.name, schedule: job.schedule }, "Cron started");
  }
}

export function stopAllCrons(): void {
  for (const [name, task] of tasks) {
    task.stop();
    logger.info({ name }, "Cron stopped");
  }
  tasks.clear();
}

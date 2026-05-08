import { Cron } from "croner";
import { logger } from "../utils/logger";
import { tick as processDeferredTick } from "./process-deferred";
import { tick as dailyReportTick } from "./daily-report";

interface CronJob {
  name: string;
  /** Standard cron expression (seconds supported). */
  schedule: string;
  tick: () => Promise<void>;
}

/** Add new cron jobs here. One entry per job. */
const JOBS: CronJob[] = [
  {
    name: "process-deferred",
    // Every 30 seconds — resolves deferred rule evaluations (poll-based steps)
    schedule: "*/30 * * * * *",
    tick: processDeferredTick,
  },
  {
    name: "daily-report",
    // Every day at 12 AM
    schedule: "0 0 * * *",
    tick: () => dailyReportTick()
  },
];

interface ManagedTask {
  cron: Cron;
  /** Resolves when the currently-running tick finishes. Null when idle. */
  currentRun: Promise<void> | null;
}

const tasks: ManagedTask[] = [];

export function startAllCrons(): void {
  for (const job of JOBS) {
    const managed = { cron: undefined as unknown as Cron, currentRun: null as Promise<void> | null };

    managed.cron = new Cron(
      job.schedule,
      {
        name: job.name,
        protect: true,
        catch: (err) => logger.error({ name: job.name, err }, "Cron tick error"),
      },
      () => {
        managed.currentRun = job.tick().finally(() => {
          managed.currentRun = null;
        });
      },
    );

    tasks.push(managed);
    logger.info({ name: job.name, schedule: job.schedule }, "Cron started");
  }
}

/**
 * Stop scheduling new ticks and wait for any in-progress tick to finish.
 * Safe to await in a shutdown handler — guarantees clean exit.
 */
export async function stopAllCrons(): Promise<void> {
  await Promise.all(
    tasks.map(async ({ cron, currentRun }) => {
      cron.stop();
      if (currentRun) await currentRun;
      logger.info({ name: cron.name }, "Cron stopped");
    }),
  );
  tasks.length = 0;
}

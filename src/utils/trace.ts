import { AsyncLocalStorage } from "node:async_hooks";

export type TraceContext = {
  requestId: string;
};

const storage = new AsyncLocalStorage<TraceContext>();

export function runWithTrace(context: TraceContext, fn: () => Promise<void>): Promise<void> {
  return storage.run(context, fn);
}

export function getTrace(): TraceContext {
  const ctx = storage.getStore();

  if (!ctx) {
    return { requestId: "no-trace" };
  }

  return ctx;
}

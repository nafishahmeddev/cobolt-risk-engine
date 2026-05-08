import { RuleResult, RuleName, TransactionType } from "@app/database/primary";
import type { RuleContext } from "../../../types/assesment";

export type RuleFn = (ctx: RuleContext) => Promise<RuleResult>;

export type DeferredResolver = (
  metadata: Record<string, unknown>,
) => Promise<{ completed: false; result?: undefined } | { completed: true; result: RuleResult }>;

export interface RuleRegistration {
  name: RuleName;
  handler: RuleFn;
  appliesTo: TransactionType[];
}

const ruleRegistry = new Map<RuleName, RuleRegistration>();
const deferredResolvers = new Map<RuleName, DeferredResolver>();

export function registerRule(registration: RuleRegistration): void {
  ruleRegistry.set(registration.name, registration);
}

export function registerDeferredResolver(rule: RuleName, resolver: DeferredResolver): void {
  deferredResolvers.set(rule, resolver);
}

export function getRulesForType(transactionType: TransactionType): RuleRegistration[] {
  return Array.from(ruleRegistry.values()).filter((r) => r.appliesTo.includes(transactionType));
}

export function getDeferredResolver(rule: RuleName): DeferredResolver | undefined {
  return deferredResolvers.get(rule);
}

export async function evaluateAllRules(ctx: RuleContext): Promise<RuleResult[]> {
  const handlers = getRulesForType(ctx.transactionType).map((r) => r.handler);
  return Promise.all(handlers.map((fn) => fn(ctx)));
}

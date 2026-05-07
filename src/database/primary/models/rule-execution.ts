import { type Model, Schema } from "mongoose";
import { AlertLevel, type RuleName } from "../../../types/risk";
import { conn } from "../connection";

export type RuleExecutionState = "pending" | "completed" | "deferred" | "failed";

/**
 * Immutable audit record for each rule evaluation within an assessment.
 * Created when the assessment starts, updated when the rule completes or defers.
 * Never deleted — provides an independent, queryable audit trail per rule.
 */
export interface IRuleExecution {
  /** Unique execution identifier (format: `{assessmentId}_{ruleName}`). */
  executionId: string;
  /** Parent assessment identifier. */
  assessmentId: string;
  /** Rule that was evaluated. */
  rule: RuleName;
  /** Current lifecycle state of this rule execution. */
  state: RuleExecutionState;
  /** Whether the rule fired. Meaningful only when state is "completed". */
  triggered: boolean;
  /** Severity of the alert. */
  alertLevel: AlertLevel;
  /** Human-readable outcome detail. */
  detail: string;
  /** Rule-specific metadata for the deferred resolver. Shape depends on the rule. */
  metadata?: Record<string, unknown>;
  /** When this rule evaluation started. */
  startedAt: Date;
  /** When this rule evaluation completed (sync or deferred resolution). */
  completedAt?: Date;
}

const schema = new Schema<IRuleExecution>(
  {
    executionId: { type: String, required: true, unique: true },
    assessmentId: { type: String, required: true, index: true },
    rule: { type: String, required: true },
    state: {
      type: String,
      enum: ["pending", "completed", "deferred", "failed"],
      required: true,
    },
    triggered: { type: Boolean, required: true },
    alertLevel: { type: String, enum: Object.values(AlertLevel), required: true },
    detail: { type: String, default: "" },
    metadata: { type: Schema.Types.Mixed },
    startedAt: { type: Date, required: true },
    completedAt: { type: Date },
  },
  {
    collection: "rule_executions",
    timestamps: false,
    versionKey: false,
  },
);

schema.index({ rule: 1, startedAt: -1 });
schema.index({ assessmentId: 1, rule: 1 }, { unique: true });

export const RuleExecution: Model<IRuleExecution> = conn.model<IRuleExecution>("RuleExecution", schema);

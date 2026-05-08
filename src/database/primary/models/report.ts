import type { RuleName, TransactionType } from "@app/database/primary";
import { type Model, Schema } from "mongoose";
import { conn } from "../connection";
import { ALERT_LEVELS, type IRuleResultDoc } from "./assesments";

export enum ReportType {
  VELOCITY_SPIKE_DETECTION_REPORT = "VELOCITY_SPIKE_DETECTION_REPORT",
  HIGH_FREQUENCY_TRANSACTION_ACTIVITY_REPORT = "HIGH_FREQUENCY_TRANSACTION_ACTIVITY_REPORT",
  TRANSACTION_SIZE_DEVIATION_REPORT = "TRANSACTION_SIZE_DEVIATION_REPORT",
  SACTION_WALLET_EXPOSURE_REPORT = "SACTION_WALLET_EXPOSURE_REPORT",
  CROSS_BORDER_TRANSACTION_SURGE_REPORT = "CROSS_BORDER_TRANSACTION_SURGE_REPORT",
  COORDINATED_WALLET_CLUSTER_ACTIVITY_REPORT = "COORDINATED_WALLET_CLUSTER_ACTIVITY_REPORT",
  MARKET_EVENT_TRANSACTIN_MONITORING_REPORT = "MARKET_EVENT_TRANSACTIN_MONITORING_REPORT"
}
export const REPORT_TYPES = Object.values(ReportType);

//frequency of reports
export enum ReportFrequency {
  DAILY = "DAILY",
  WEEKLY = "WEEKLY",
  MONTHLY = "MONTHLY"
}
export const FREQUENCIES = Object.values(ReportFrequency);


/**
 * Immutable audit record written once when an assessment finalises.
 * Never updated after creation — presence here = assessment complete.
 * `allow` captures the final decision; `triggeredRules` lists what fired.
 */
export interface IReport {
  type: ReportType;
  reportDate: Date;
  frequency: ReportFrequency;
  data: Record<string, unknown>;
}

const schema = new Schema<IReport>(
  {
    type: {
      type: String,
      enum: REPORT_TYPES,
      required: true,
    },
    reportDate: { type: Date, required: true },
    frequency: {
      type: String,
      enum: FREQUENCIES,
      required: true,
    },
    data: {
      type: Object,
      required: true,
    },
  },
  { collection: "report", timestamps: false, versionKey: false },
);

export const Report: Model<IReport> = conn.model<IReport>("Report", schema);

import { type Model, Schema } from "mongoose";
import { conn } from "../connection";

/** Lifecycle status of a user's risk profile. */
export enum ProfileStatus {
  /** Normal — assessments proceed as usual. */
  ACTIVE = "active",
  /** Under review — assessments still run but flagged for manual inspection. */
  FLAGGED = "flagged",
  /** Suspended — all transactions blocked regardless of rule outcome. */
  BLOCKED = "blocked",
}

export const PROFILE_STATUSES = Object.values(ProfileStatus);

/** Plain-data snapshot of a user's risk profile, passed into rule evaluations. */
export type IProfile = {
  /** Internal user identifier. */
  userRef: string;
  /** All wallet addresses linked to this user. */
  walletIds: string[];
  /** Current lifecycle status of the profile. */
  status: ProfileStatus;
  /** Timestamp when the user was onboarded onto the platform. */
  onboardedAt: Date;
  /** Customer's self-declared expected monthly transaction volume (smallest currency unit). */
  declaredMonthlyVolume: number;
  /** Customer's self-declared country of residence. */
  declaredCountry: string;
  /** Exponentially weighted moving average of transaction amounts over approximately 30 days. */
  thirtyDayAverage: number;
  /** Established baseline for total 24h deposit volume, used by CROSS_BORDER_SURGE rule. */
  crossBorderBaseline: number;
  /** Rolling count of deposit transactions in the last 24 hours. */
  crossBorderCount24h: number;
  /** Total number of risk assessments run for this user. */
  totalAssessments: number;
  /** Timestamp of the most recent assessment. */
  lastAssessedAt: Date;
};

const schema = new Schema<IProfile>(
  {
    userRef: { type: String, required: true, unique: true },
    walletIds: { type: [String], default: [] },
    status: { type: String, enum: Object.values(ProfileStatus), default: ProfileStatus.ACTIVE },
    onboardedAt: { type: Date, required: true },
    declaredMonthlyVolume: { type: Number, default: 0 },
    declaredCountry: { type: String, default: "" },
    thirtyDayAverage: { type: Number, default: 0 },
    crossBorderBaseline: { type: Number, default: 0 },
    crossBorderCount24h: { type: Number, default: 0 },
    totalAssessments: { type: Number, default: 0 },
    lastAssessedAt: { type: Date, required: true },
  },
  { collection: "profiles", timestamps: true },
);

export const Profile: Model<IProfile> = conn.model<IProfile>("Profile", schema);

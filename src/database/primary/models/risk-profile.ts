import { type Model, Schema } from "mongoose";
import { ProfileStatus, type RiskProfileData } from "../../../types/risk";
import { conn } from "../connection";

export type IRiskProfile = RiskProfileData;

const schema = new Schema<IRiskProfile>(
  {
    userRef: { type: String, required: true, unique: true },
    walletIds: { type: [String], default: [] },
    status: { type: String, enum: Object.values(ProfileStatus), default: ProfileStatus.ACTIVE },
    onboardedAt: { type: Date, required: true },
    declaredMonthlyVolume: { type: Number, default: 0 },
    thirtyDayAverage: { type: Number, default: 0 },
    crossBorderBaseline: { type: Number, default: 0 },
    crossBorderCount24h: { type: Number, default: 0 },
    totalAssessments: { type: Number, default: 0 },
    lastAssessedAt: { type: Date, required: true },
  },
  { collection: "risk_profiles", timestamps: true },
);

export const RiskProfile: Model<IRiskProfile> = conn.model<IRiskProfile>("RiskProfile", schema);

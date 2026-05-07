import { type Model, Schema } from "mongoose";
import { AlertLevel } from "../../../types/risk";
import { conn } from "../connection";

export interface IRiskLedger {
  assessmentId: string;
  userRef: string;
  walletId: string;
  counterpartyId: string;
  chain: string;
  destinationWalletId: string;
  amount: number;
  currency: string;
  transactionType: string;
  allow: boolean;
  triggeredRules: string[];
  ruleResults: {
    rule: string;
    triggered: boolean;
    alertLevel: AlertLevel;
    detail: string;
  }[];
  createdAt: Date;
}

const schema = new Schema<IRiskLedger>(
  {
    assessmentId: { type: String, required: true, unique: true },
    userRef: { type: String, required: true, index: true },
    walletId: { type: String, required: true },
    counterpartyId: { type: String, default: "" },
    chain: { type: String, default: "" },
    destinationWalletId: { type: String, default: "" },
    amount: { type: Number, required: true },
    currency: { type: String, required: true },
    transactionType: { type: String, required: true },
    allow: { type: Boolean, required: true },
    triggeredRules: { type: [String], default: [] },
    ruleResults: [
      {
        rule: { type: String, required: true },
        triggered: { type: Boolean, required: true },
        alertLevel: { type: String, enum: Object.values(AlertLevel), required: true },
        detail: { type: String, default: "" },
      },
    ],
    createdAt: { type: Date, required: true, index: true },
  },
  { collection: "risk_ledger", timestamps: false },
);

export const RiskLedger: Model<IRiskLedger> = conn.model<IRiskLedger>("RiskLedger", schema);

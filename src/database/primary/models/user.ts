import { Schema } from "mongoose";
import { conn } from "../connection";

export interface IUser {
  name: string;
  email: string;
  role: "admin" | "user";
  isActive: boolean;
  lastLoginAt?: Date;
}

export const UserSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true, index: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    role: { type: String, enum: ["admin", "user"], default: "user" },
    isActive: { type: Boolean, default: true },
    lastLoginAt: { type: Date },
  },
  { timestamps: true },
);

export const User = conn.model<IUser>("User", UserSchema);

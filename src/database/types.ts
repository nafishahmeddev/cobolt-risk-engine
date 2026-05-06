import type { Document, Model } from "mongoose";

export type LeanDocument<T> = T & { _id: string; __v?: number };

export type TypedModel<T> = Model<T & Document>;

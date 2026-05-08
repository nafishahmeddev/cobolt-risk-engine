import { Profile } from "@app/database/primary";
import { Hono } from "hono";
import { z } from "zod";
import { auth } from "../../middleware/auth";
import { zValidate } from "../../middleware/validator";
import type { AppBindings } from "../../types/api.types";
import { badRequest, created, success } from "../../utils/response";

const profileRouter = new Hono<AppBindings>();

// ─── Schemas ─────────────────────────────────────────────────────────────────

const profileCreateSchema = z.object({
  userRef: z.string().min(1),
  declaredMonthlyVolume: z.number().int().positive(),
  declaredCountry: z.string().length(2),
});

const profileUpdateSchema = z.object({
  declaredMonthlyVolume: z.number().int().positive(),
});

// ─── Routes ──────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/profile
 * Create a profile for a user.
 * Returns the created profile.
 */
profileRouter.post("/", auth, zValidate("json", profileCreateSchema), async (c) => {
  const data = c.req.valid("json");
  const existingProfile = await Profile.findOne({ userRef: data.userRef });
  if (existingProfile) {
    return badRequest(c, "Profile already exists");
  }
  const profile = await Profile.create({
    walletIds: [],
    userRef: data.userRef,
    declaredMonthlyVolume: data.declaredMonthlyVolume,
    declaredCountry: data.declaredCountry,
  });
  return created(c, {
    profile: profile.toObject(),
  });
});

/**
 * PATCH /api/v1/profile/:userRef/wallet
 * Add a wallet to a user's profile.
 * Returns the updated profile.
 */
profileRouter.patch("/:userRef/wallet", auth, zValidate("json", profileUpdateSchema), async (c) => {
  const userRef = c.req.param("userRef");
  const existingProfile = await Profile.findOne({ userRef });
  if (!existingProfile) {
    return badRequest(c, "Profile not found");
  }
  const profile = await Profile.findOneAndUpdate({ userRef }, { $set: { ...c.req.valid("json") } }, { new: true });
  return success(c, {
    profileId: profile?._id,
  });
});

export { profileRouter };

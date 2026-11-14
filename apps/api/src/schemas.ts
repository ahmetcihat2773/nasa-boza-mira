import { z } from "zod";

/**
 * Request schemas. They check the parts of the sim's `MissionResult` (packages/sim/src/run.ts) the API
 * reads; other fields pass through unchanged so the web app can store the whole result.
 */

export const MissionIdSchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]{0,63}$/, "mission id: lowercase letters, digits and dashes");

/** Nicknames only: short display names, no other personal data. */
export const NicknameSchema = z
  .string()
  .trim()
  .min(1)
  .max(24)
  .regex(/^[^\p{Cc}<>]+$/u, "nickname: no control characters or angle brackets");

export const CauseSchema = z.looseObject({
  phase: z.enum(["design", "development", "launch", "operations", "result"]),
  tone: z.enum(["good", "bad", "neutral"]),
  text: z.string().min(1).max(1000),
});
export type CauseInput = z.infer<typeof CauseSchema>;

export const ScoreSchema = z.looseObject({
  total: z.number().int().min(0).max(1000),
  stars: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  components: z.array(
    z.looseObject({
      id: z.string(),
      weight: z.number(),
      value: z.number(),
      points: z.number(),
      explanation: z.string(),
    }),
  ),
});

export const RealMissionMatchSchema = z.looseObject({
  mission: z.looseObject({ name: z.string() }),
  reason: z.string().max(2000),
});

export const MissionResultSchema = z.looseObject({
  seed: z.union([z.number(), z.string().max(64)]),
  success: z.boolean(),
  failureReasons: z.array(z.string().max(1000)).max(20).default([]),
  score: ScoreSchema.nullable(),
  causes: z.array(CauseSchema).max(50),
  realMission: RealMissionMatchSchema,
});
export type MissionResultInput = z.infer<typeof MissionResultSchema>;

export const SaveAttemptSchema = z
  .strictObject({
    missionId: MissionIdSchema,
    nicknames: z.array(NicknameSchema).min(1).max(4),
    seed: z.union([z.number(), z.string().min(1).max(64)]),
    design: z.record(z.string(), z.unknown()),
    result: MissionResultSchema,
  })
  .refine((a) => String(a.seed) === String(a.result.seed), { message: "seed must match result.seed", path: ["seed"] });
export type SaveAttemptInput = z.infer<typeof SaveAttemptSchema>;

export const FlightDirectorRequestSchema = z.strictObject({
  missionId: MissionIdSchema,
  /** Optional display name of the mission, e.g. "Wildfire watch". */
  missionName: z.string().max(120).optional(),
  result: MissionResultSchema,
});
export type FlightDirectorRequest = z.infer<typeof FlightDirectorRequestSchema>;

/** Turns Zod issues into a short list the web app can show or log. */
export function issuesOf(error: z.ZodError): { path: string; message: string }[] {
  return error.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
}

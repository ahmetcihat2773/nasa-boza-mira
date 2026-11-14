import { z } from "zod";
import rawLaunchers from "../json/launchers.json" with { type: "json" };
import { SourceSchema } from "./sources.ts";

/** The orbit a rideshare flies to; the player cannot change it. */
export const FixedOrbitSchema = z.strictObject({
  type: z.string().min(1),
  altitudeKm: z.number().positive(),
});

const RIDESHARE_FIELDS = ["costPerKgUsd", "includedKg", "fixedOrbit"] as const;

/**
 * One launcher in packages/data/json/launchers.json (built by scripts/fetch-launchers.ts).
 * Launch Library 2 vehicles have a numeric id; manual entries (the rideshare) have a string id.
 * The rideshare-only fields come as a set: all of costPerKgUsd, includedKg and fixedOrbit, or none.
 */
export const LauncherSchema = z
  .strictObject({
    id: z.union([z.int().positive(), z.string().min(1)]),
    name: z.string().min(1),
    manufacturer: z.string().min(1).nullable(),
    leoCapacityKg: z.number().positive(),
    ssoCapacityKg: z.int().positive(),
    gtoCapacityKg: z.number().positive().nullable(),
    launchCostUsd: z.int().positive(),
    successfulLaunches: z.int().nonnegative().nullable(),
    failedLaunches: z.int().nonnegative().nullable(),
    successRate: z.number().min(0).max(1),
    reusable: z.boolean(),
    imageUrl: z.url().nullable(),
    infoUrl: z.url().nullable(),
    sources: z.array(SourceSchema).min(1),
    // Rideshare only.
    costPerKgUsd: z.number().positive().optional(),
    includedKg: z.number().positive().optional(),
    fixedOrbit: FixedOrbitSchema.optional(),
    note: z.string().min(1).optional(),
  })
  .superRefine((l, ctx) => {
    if (l.ssoCapacityKg > l.leoCapacityKg) {
      ctx.addIssue({ code: "custom", path: ["ssoCapacityKg"], message: "must be at most leoCapacityKg" });
    }
    const ssoSources = l.sources.filter((s) => s.fields.includes("ssoCapacityKg")).length;
    if (ssoSources !== 1) {
      ctx.addIssue({
        code: "custom",
        path: ["sources"],
        message: `needs exactly one entry that lists ssoCapacityKg, found ${ssoSources}`,
      });
    }
    const present = RIDESHARE_FIELDS.filter((f) => l[f] !== undefined).length;
    if (present !== 0 && present !== RIDESHARE_FIELDS.length) {
      ctx.addIssue({ code: "custom", message: `${RIDESHARE_FIELDS.join(", ")} must be given together or not at all` });
    }
  });

export type Launcher = z.infer<typeof LauncherSchema>;

/** The whole launcher list: at least one launcher, ids unique. */
export const LauncherListSchema = z
  .array(LauncherSchema)
  .min(1)
  .superRefine((list, ctx) => {
    const seen = new Set<number | string>();
    list.forEach((l, i) => {
      if (seen.has(l.id)) ctx.addIssue({ code: "custom", path: [i, "id"], message: `id ${l.id} is listed twice` });
      seen.add(l.id);
    });
  });

/** The validated launchers the game uses. Parsing throws at import time if the JSON is invalid. */
export const launchers: readonly Launcher[] = LauncherListSchema.parse(rawLaunchers);

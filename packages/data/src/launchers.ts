import { z } from "zod";
import rawLaunchers from "../json/launchers.json" with { type: "json" };
import { SourceSchema } from "./sources.ts";

/** The orbit a rideshare flies to; the player cannot change it. */
export const FixedOrbitSchema = z.strictObject({
  type: z.string().min(1),
  altitudeKm: z.number().positive(),
});

const RIDESHARE_FIELDS = ["costPerKgUsd", "includedKg"] as const;

/** Which missions a launcher serves. Launchers without one serve Earth orbit (the Moon via tliCapacityFactor). */
export const LauncherDestinationSchema = z.enum(["earth-orbit", "lunar-orbit"]);

/**
 * One launcher in packages/data/json/launchers.json (built by scripts/fetch-launchers.ts).
 * Launch Library 2 vehicles have a numeric id; manual entries (the rideshares) have a string id.
 * The rideshare-only price fields come as a set: both costPerKgUsd and includedKg, or neither.
 * An Earth rideshare also has fixedOrbit; the lunar rideshare has tliCapacityKg and fixedLaunchMonth instead.
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
    // Lunar rideshare only (design.md section 10.2).
    destination: LauncherDestinationSchema.optional(),
    /** Mass it carries onto a trans-lunar trajectory; replaces leoCapacityKg × tliCapacityFactor. */
    tliCapacityKg: z.number().positive().optional(),
    /** The flight date is fixed: the month, counted from the start of development, the spacecraft must be ready by. */
    fixedLaunchMonth: z.int().positive().optional(),
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
    const lunar = l.destination === "lunar-orbit";
    if (lunar !== (l.tliCapacityKg !== undefined) || lunar !== (l.fixedLaunchMonth !== undefined)) {
      ctx.addIssue({ code: "custom", message: "tliCapacityKg and fixedLaunchMonth are required for a lunar-orbit launcher, and only for it" });
    }
    if (lunar && l.fixedOrbit !== undefined) {
      ctx.addIssue({ code: "custom", path: ["fixedOrbit"], message: "a lunar rideshare has no Earth orbit" });
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

/** Every validated launcher, both missions. Parsing throws at import time if the JSON is invalid. */
export const allLaunchers: readonly Launcher[] = LauncherListSchema.parse(rawLaunchers);

/** Launchers for a mission: Earth-orbit launchers serve both destinations; the lunar rideshare only the Moon. */
export function launchersFor(destination: "earth-orbit" | "lunar-orbit"): readonly Launcher[] {
  return allLaunchers.filter((l) => (l.destination ?? "earth-orbit") === "earth-orbit" || l.destination === destination);
}

/** The launchers for Earth-orbit missions (Wildfire Watch); unchanged by the lunar rideshare. */
export const launchers: readonly Launcher[] = launchersFor("earth-orbit");

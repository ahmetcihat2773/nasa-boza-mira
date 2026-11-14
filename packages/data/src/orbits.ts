import { z } from "zod";
import rawOrbits from "../json/orbits.json" with { type: "json" };
import { SourceSchema } from "./sources.ts";
import { uniqueBy } from "./unique.ts";

/** Orbit types the Launch role can choose. "sun-synchronous" matches the rideshare's fixedOrbit.type. */
export const OrbitTypeIdSchema = z.enum(["sun-synchronous", "polar", "inclined"]);
export type OrbitTypeId = z.infer<typeof OrbitTypeIdSchema>;

export const OrbitTypeSchema = z.strictObject({
  id: OrbitTypeIdSchema,
  name: z.string().min(1),
  /** null: computed from altitude (sun-synchronous). */
  inclinationDeg: z.number().min(0).max(180).nullable(),
  text: z.string().min(1),
  sources: z.array(SourceSchema).min(1),
});
export type OrbitType = z.infer<typeof OrbitTypeSchema>;

/** An altitude option with the rough orbit lifetime when the satellite has no propulsion (R4). */
export const AltitudeOptionSchema = z.strictObject({
  altitudeKm: z.number().min(160).max(2000),
  lifetimeYearsNoPropulsion: z.number().positive(),
});
export type AltitudeOption = z.infer<typeof AltitudeOptionSchema>;

/** Near-Earth stations serve Earth-orbit missions; deep-space stations serve the Moon (design.md section 10.2). */
export const GroundStationKindSchema = z.enum(["near-earth", "deep-space"]);
export type GroundStationKind = z.infer<typeof GroundStationKindSchema>;

/**
 * A ground station: daily contact minutes per orbit type (near-Earth) or at the Moon (deep-space),
 * and its rent for the whole mission (Ground allocation).
 */
export const GroundStationSchema = z
  .strictObject({
    id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
    name: z.string().min(1),
    kind: GroundStationKindSchema,
    latDeg: z.number().min(-90).max(90),
    lonDeg: z.number().min(-180).max(180),
    contactMinutesPerDay: z.record(OrbitTypeIdSchema, z.number().nonnegative()),
    /** Deep-space stations only: minutes per day the Moon is above the horizon, usable by a lunar orbiter. */
    lunarContactMinutesPerDay: z.number().positive().optional(),
    costUsd: z.int().positive(),
    text: z.string().min(1),
    sources: z.array(SourceSchema).min(1),
  })
  .superRefine((g, ctx) => {
    if ((g.kind === "deep-space") !== (g.lunarContactMinutesPerDay !== undefined))
      ctx.addIssue({
        code: "custom",
        path: ["lunarContactMinutesPerDay"],
        message: "required for deep-space stations, and only for them",
      });
  });
export type GroundStation = z.infer<typeof GroundStationSchema>;

export const OrbitsFileSchema = z.strictObject({
  orbitTypes: z.array(OrbitTypeSchema).min(1).superRefine(uniqueBy("id")),
  altitudes: z
    .array(AltitudeOptionSchema)
    .min(2)
    .superRefine((list, ctx) => {
      list.forEach((a, i) => {
        const prev = list[i - 1];
        if (prev && (a.altitudeKm <= prev.altitudeKm || a.lifetimeYearsNoPropulsion < prev.lifetimeYearsNoPropulsion))
          ctx.addIssue({ code: "custom", path: [i], message: "altitudes must rise, with lifetimes not falling" });
      });
    }),
  altitudeSources: z.array(SourceSchema).min(1),
  maxGroundStations: z.int().positive(),
  groundStations: z.array(GroundStationSchema).min(1).superRefine(uniqueBy("id")),
});

const parsed = OrbitsFileSchema.parse(rawOrbits);

/** Validated orbit options. Parsing throws at import time if the JSON is invalid. */
export const orbitTypes: readonly OrbitType[] = parsed.orbitTypes;
/** Altitude options, lowest first. */
export const altitudeOptions: readonly AltitudeOption[] = parsed.altitudes;
export const maxGroundStations: number = parsed.maxGroundStations;
/** Every station, near-Earth and deep-space. */
export const groundStations: readonly GroundStation[] = parsed.groundStations;
/** Stations for Earth-orbit missions (Wildfire Watch). */
export const nearEarthStations: readonly GroundStation[] = groundStations.filter((g) => g.kind === "near-earth");
/** Stations for lunar missions (Lunar Ice Hunter). */
export const deepSpaceStations: readonly GroundStation[] = groundStations.filter((g) => g.kind === "deep-space");

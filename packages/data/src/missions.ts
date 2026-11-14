import { z } from "zod";
import rawMissions from "../json/missions.json" with { type: "json" };
import { InstrumentKindSchema } from "./instruments.ts";
import { SourceSchema } from "./sources.ts";
import { uniqueBy } from "./unique.ts";

/** One real Earth-observation satellite, for the "your design resembles…" match (T14.6). */
export const RealMissionSchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  name: z.string().min(1),
  agency: z.string().min(1),
  launchYear: z.int().min(1957),
  orbitType: z.enum(["sun-synchronous", "polar", "inclined", "geostationary"]),
  altitudeKm: z.number().positive(),
  inclinationDeg: z.number().min(0).max(180),
  massKg: z.number().positive(),
  powerW: z.number().positive(),
  sizeClass: z.enum(["cubesat", "smallsat", "large"]),
  instrumentKind: InstrumentKindSchema,
  detectsFire: z.boolean(),
  /** Our own one-sentence summary. */
  summary: z.string().min(1),
  url: z.url(),
});
export type RealMission = z.infer<typeof RealMissionSchema>;

export const RealMissionsFileSchema = z.strictObject({
  note: z.string().min(1),
  missions: z.array(RealMissionSchema).min(10).max(15).superRefine(uniqueBy("id")),
  sources: z.array(SourceSchema).min(1),
});

/** The validated real missions. Parsing throws at import time if the JSON is invalid. */
export const realMissions: readonly RealMission[] = RealMissionsFileSchema.parse(rawMissions).missions;

import { z } from "zod";
import rawInstruments from "../json/instruments.json" with { type: "json" };
import { SpacecraftSizeSchema } from "./parts.ts";
import { DataQualitySchema, SourceSchema } from "./sources.ts";

/** Instrument class (design.md section 4.3): what part of the spectrum it observes. */
export const InstrumentKindSchema = z.enum(["visible", "swir-mwir", "thermal-ir", "multiband"]);
export type InstrumentKind = z.infer<typeof InstrumentKindSchema>;

/** What an instrument can detect for Wildfire Watch: R2 needs daylightFire; nightFire earns the night bonus. */
export const DetectionSchema = z.enum(["daylightFire", "nightFire", "smoke"]);
export type Detection = z.infer<typeof DetectionSchema>;

/** Science value per mission (0–100, game-design). One key per mission that uses the instrument. */
export const ScienceValueSchema = z.strictObject({
  wildfireWatch: z.int().min(0).max(100),
});

/** Fields a `sources` entry may name; every one must be covered by at least one entry. */
const SOURCED_FIELDS = [
  "massKg",
  "powerW",
  "dataRateMbps",
  "costUsd",
  "trl",
  "fieldOfViewDeg",
  "groundSampleDistanceM",
  "scienceValue",
] as const;

/**
 * One instrument in packages/data/json/instruments.json.
 * powerW and dataRateMbps apply while the instrument is imaging (the simulation handles duty cycles).
 * groundSampleDistanceM is the nadir pixel size at referenceAltitudeKm and scales linearly with altitude;
 * the swath is 2 × altitude × tan(fieldOfViewDeg / 2).
 */
export const InstrumentSchema = z
  .strictObject({
    id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
    name: z.string().min(1),
    kind: InstrumentKindSchema,
    massKg: z.number().positive(),
    powerW: z.number().positive(),
    dataRateMbps: z.number().positive(),
    costUsd: z.int().positive(),
    trl: z.int().min(1).max(9),
    fieldOfViewDeg: z.number().positive().max(180),
    groundSampleDistanceM: z.number().positive(),
    referenceAltitudeKm: z.number().positive(),
    detects: z.array(DetectionSchema).min(1),
    fits: z.array(SpacecraftSizeSchema).min(1),
    scienceValue: ScienceValueSchema,
    sources: z.array(SourceSchema).min(1),
  })
  .superRefine((ins, ctx) => {
    for (const [key, list] of [
      ["detects", ins.detects],
      ["fits", ins.fits],
    ] as const) {
      if (new Set(list).size !== list.length)
        ctx.addIssue({ code: "custom", path: [key], message: "lists a value twice" });
    }
    const named = ins.sources.flatMap((s) => s.fields);
    for (const f of named) {
      if (!(SOURCED_FIELDS as readonly string[]).includes(f)) {
        ctx.addIssue({ code: "custom", path: ["sources"], message: `unknown field "${f}" in sources` });
      }
    }
    for (const f of SOURCED_FIELDS) {
      if (!named.includes(f)) ctx.addIssue({ code: "custom", path: ["sources"], message: `no source for ${f}` });
    }
  });
export type Instrument = z.infer<typeof InstrumentSchema>;

/** How every instrument costUsd was derived (APIDoc.md, "Instruments: how the file is built"). */
export const InstrumentCostMethodSchema = z.strictObject({
  data_quality: DataQualitySchema,
  note: z.string().min(1),
});
export type InstrumentCostMethod = z.infer<typeof InstrumentCostMethodSchema>;

/** The whole instruments file: the cost method plus 6–8 instruments with unique ids. */
export const InstrumentsFileSchema = z.strictObject({
  costMethod: InstrumentCostMethodSchema,
  instruments: z
    .array(InstrumentSchema)
    .min(6)
    .max(8)
    .superRefine((list, ctx) => {
      const seen = new Set<string>();
      list.forEach((ins, i) => {
        if (seen.has(ins.id))
          ctx.addIssue({ code: "custom", path: [i, "id"], message: `id ${ins.id} is listed twice` });
        seen.add(ins.id);
      });
    }),
});

const parsed = InstrumentsFileSchema.parse(rawInstruments);

/** The validated instruments the game uses. Parsing throws at import time if the JSON is invalid. */
export const instruments: readonly Instrument[] = parsed.instruments;
/** The cost method stated in the file. */
export const instrumentsCostMethod: InstrumentCostMethod = parsed.costMethod;

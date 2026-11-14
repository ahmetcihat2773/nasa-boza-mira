import { z } from "zod";
import rawParts from "../json/parts.json" with { type: "json" };
import { DataQualitySchema, SourceSchema } from "./sources.ts";

export const SubsystemSchema = z.enum(["structure", "solar", "battery", "obc", "adcs", "propulsion", "comms"]);
export type Subsystem = z.infer<typeof SubsystemSchema>;

/** The role that owns a part (design.md section 2): communications belong to Ground, everything else to Spacecraft. */
export const PartRoleSchema = z.enum(["spacecraft", "ground"]);
export const TierSchema = z.enum(["basic", "standard", "advanced"]);
export type Tier = z.infer<typeof TierSchema>;
export const SpacecraftSizeSchema = z.enum(["6U", "12U", "smallsat"]);
export type SpacecraftSize = z.infer<typeof SpacecraftSizeSchema>;

/** The one number that says how good a part is, with its unit. */
export const PerformanceSchema = z.strictObject({
  value: z.number().nonnegative(),
  unit: z.enum(["kg", "W", "Wh", "krad", "deg", "Ns", "kbps"]),
  label: z.string().min(1),
});

/** Fields a `sources` entry may name, and those that must be covered by at least one entry. */
const SOURCED_FIELDS = [
  "massKg",
  "powerW",
  "powerProducedW",
  "costUsd",
  "performance",
  "trl",
  "specificImpulseS",
  "lunarRateFactor",
] as const;
const REQUIRED_SOURCED = ["massKg", "powerW", "costUsd", "performance", "trl"] as const;

/**
 * One part in packages/data/json/parts.json.
 * powerW is the power drawn while the part operates (the simulation handles duty cycles);
 * powerProducedW is peak power in sunlight, for solar parts only.
 */
export const PartSchema = z
  .strictObject({
    id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
    name: z.string().min(1),
    subsystem: SubsystemSchema,
    role: PartRoleSchema,
    tier: TierSchema,
    massKg: z.number().nonnegative(),
    powerW: z.number().nonnegative(),
    powerProducedW: z.number().positive().optional(),
    costUsd: z.int().nonnegative(),
    performance: PerformanceSchema,
    trl: z.int().min(1).max(9),
    fits: z.array(SpacecraftSizeSchema).min(1),
    /** Propulsion only (except "no propulsion"): for the rocket equation on lunar missions. */
    specificImpulseS: z.number().positive().optional(),
    /** Radios only: data-rate multiplier at lunar distance (design.md section 10.2). */
    lunarRateFactor: z.number().positive().max(1).optional(),
    basedOn: z.string().min(1).optional(),
    sources: z.array(SourceSchema).min(1),
  })
  .superRefine((p, ctx) => {
    const needsIsp = p.subsystem === "propulsion" && p.performance.value > 0;
    if (needsIsp !== (p.specificImpulseS !== undefined))
      ctx.addIssue({
        code: "custom",
        path: ["specificImpulseS"],
        message: "required for every propulsion part with thrust, and only for them",
      });
    if ((p.subsystem === "comms") !== (p.lunarRateFactor !== undefined))
      ctx.addIssue({ code: "custom", path: ["lunarRateFactor"], message: "required for radios, and only for them" });
    const expectedRole = p.subsystem === "comms" ? "ground" : "spacecraft";
    if (p.role !== expectedRole) {
      ctx.addIssue({ code: "custom", path: ["role"], message: `a ${p.subsystem} part belongs to ${expectedRole}` });
    }
    if ((p.subsystem === "solar") !== (p.powerProducedW !== undefined)) {
      ctx.addIssue({
        code: "custom",
        path: ["powerProducedW"],
        message: "required for solar parts, and only for them",
      });
    }
    if (p.subsystem === "structure" && p.fits.length !== 1) {
      ctx.addIssue({
        code: "custom",
        path: ["fits"],
        message: "a structure sets the spacecraft size, so it fits exactly one size",
      });
    }
    if (new Set(p.fits).size !== p.fits.length) {
      ctx.addIssue({ code: "custom", path: ["fits"], message: "lists a size twice" });
    }
    const named = p.sources.flatMap((s) => s.fields);
    for (const f of named) {
      if (!(SOURCED_FIELDS as readonly string[]).includes(f)) {
        ctx.addIssue({ code: "custom", path: ["sources"], message: `unknown field "${f}" in sources` });
      }
    }
    const required = p.powerProducedW === undefined ? REQUIRED_SOURCED : [...REQUIRED_SOURCED, "powerProducedW"];
    for (const f of required) {
      if (!named.includes(f)) ctx.addIssue({ code: "custom", path: ["sources"], message: `no source for ${f}` });
    }
  });
export type Part = z.infer<typeof PartSchema>;

/** How every costUsd was derived (APIDoc.md, "Parts: cost method"). */
export const CostMethodSchema = z.strictObject({
  integrationAndTestFactor: z.number().positive(),
  eurToUsd: z.number().positive(),
  data_quality: DataQualitySchema,
  note: z.string().min(1),
});
export type CostMethod = z.infer<typeof CostMethodSchema>;

/** The whole parts file: the cost method plus 30–50 parts with unique ids. */
export const PartsFileSchema = z.strictObject({
  costMethod: CostMethodSchema,
  parts: z
    .array(PartSchema)
    .min(30)
    .max(50)
    .superRefine((list, ctx) => {
      const seen = new Set<string>();
      list.forEach((p, i) => {
        if (seen.has(p.id)) ctx.addIssue({ code: "custom", path: [i, "id"], message: `id ${p.id} is listed twice` });
        seen.add(p.id);
      });
    }),
});

const parsed = PartsFileSchema.parse(rawParts);

/** The validated parts the game uses. Parsing throws at import time if the JSON is invalid. */
export const parts: readonly Part[] = parsed.parts;
/** The cost method stated in the file. */
export const partsCostMethod: CostMethod = parsed.costMethod;

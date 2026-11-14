import { z } from "zod";
import rawCards from "../json/mission-cards.json" with { type: "json" };
import { DetectionSchema } from "./instruments.ts";
import { SpacecraftSizeSchema } from "./parts.ts";
import { SourceSchema } from "./sources.ts";
import { uniqueBy } from "./unique.ts";

/** The four player roles (design.md section 2), which also share the budget. */
export const RoleSchema = z.enum(["launch", "spacecraft", "science", "ground"]);
export type Role = z.infer<typeof RoleSchema>;

/** Quantities the simulation computes and a requirement or bonus can test. */
export const MetricSchema = z.enum(["revisitsPerDay", "downlinkGbPerDay", "lifetimeYears", "alertLatencyHours"]);
export type Metric = z.infer<typeof MetricSchema>;

/** How a requirement or bonus is checked: a metric at least / at most a value, or an instrument detection. */
export const RequirementCheckSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.enum(["min", "max"]),
    metric: MetricSchema,
    value: z.number().positive(),
    unit: z.string().min(1),
  }),
  z.strictObject({ kind: z.literal("detects"), detection: DetectionSchema }),
]);
export type RequirementCheck = z.infer<typeof RequirementCheckSchema>;

export const RequirementSchema = z.strictObject({
  id: z.string().regex(/^R\d+$/),
  title: z.string().min(1),
  text: z.string().min(1),
  check: RequirementCheckSchema,
  roles: z.array(RoleSchema).min(1),
  /** Plain-English reason shown when the requirement is not met. */
  failText: z.string().min(1),
});
export type Requirement = z.infer<typeof RequirementSchema>;

export const BonusObjectiveSchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  name: z.string().min(1),
  text: z.string().min(1),
  check: RequirementCheckSchema,
});
export type BonusObjective = z.infer<typeof BonusObjectiveSchema>;

const pctSum = (name: string) => (o: Record<string, number>, ctx: z.RefinementCtx) => {
  const sum = Object.values(o).reduce((s, v) => s + v, 0);
  if (sum !== 100) ctx.addIssue({ code: "custom", message: `${name} sum to ${sum}, not 100` });
};

const pct = z.int().min(0).max(100);

/**
 * One mission card (design.md section 4.3). Holds every number the sim needs for the mission:
 * budget, allocations, team cost, base times, deadline, score weights, requirements and bonuses.
 */
export const MissionCardSchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  name: z.string().min(1),
  difficulty: z.enum(["easy", "medium", "hard", "expert"]),
  objective: z.string().min(1),
  whyItMatters: z.string().min(1),
  destination: z.string().min(1),
  targetRegion: z.strictObject({
    name: z.string().min(1),
    latDeg: z.number().min(-90).max(90),
    lonDeg: z.number().min(-180).max(180),
    /** Width of the region in km (east–west), used for revisit. */
    widthKm: z.number().positive(),
  }),
  requirements: z.array(RequirementSchema).min(1).superRefine(uniqueBy("id")),
  constraints: z.strictObject({
    budgetUsd: z.int().positive(),
    sizes: z.array(SpacecraftSizeSchema).min(1),
    maxSmallsatMassKg: z.number().positive(),
    satellites: z.int().positive(),
    minTrl: z.int().min(1).max(9),
    /** Launchers costing more than the whole budget are shown locked. */
    lockLaunchersOverBudget: z.boolean(),
  }),
  /** Share of the budget per role, in percent (sums to 100). */
  allocationsPct: z
    .strictObject({ launch: pct, spacecraft: pct, science: pct, ground: pct })
    .superRefine(pctSum("allocationsPct")),
  /** Charged per month of development or waiting, split by allocation. */
  teamCostPerMonthUsd: z.int().positive(),
  baseDevMonths: z.record(SpacecraftSizeSchema, z.int().positive()),
  deadlineMonths: z.int().positive(),
  /** Months of waiting (at team cost) when the deadline is missed; the schedule score is then zero. */
  lateWaitMonths: z.int().nonnegative(),
  /** Score component weights in percent (sums to 100). */
  scoreWeights: z
    .strictObject({ science: pct, efficiency: pct, schedule: pct, risk: pct, coordination: pct })
    .superRefine(pctSum("scoreWeights")),
  bonusObjectives: z.array(BonusObjectiveSchema).superRefine(uniqueBy("id")),
  tradeOffs: z.array(z.string().min(1)),
  sources: z.array(SourceSchema).min(1),
});
export type MissionCard = z.infer<typeof MissionCardSchema>;

export const MissionCardsFileSchema = z.strictObject({
  missionCards: z.array(MissionCardSchema).min(1).superRefine(uniqueBy("id")),
});

/** The validated mission cards. Parsing throws at import time if the JSON is invalid. */
export const missionCards: readonly MissionCard[] = MissionCardsFileSchema.parse(rawCards).missionCards;

const ww = missionCards.find((c) => c.id === "wildfire-watch");
if (!ww) throw new Error("mission-cards.json has no wildfire-watch card");
/** The first mission. */
export const wildfireWatch: MissionCard = ww;

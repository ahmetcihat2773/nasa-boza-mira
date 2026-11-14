import { z } from "zod";
import rawLearning from "../json/learning.json" with { type: "json" };
import { RoleSchema } from "./missionCards.ts";
import { SourceSchema } from "./sources.ts";
import { uniqueBy } from "./unique.ts";

const Id = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);

/** One glossary term; `short` is the one-sentence tooltip. */
export const GlossaryTermSchema = z.strictObject({
  id: Id,
  term: z.string().min(1),
  short: z.string().min(1).max(200),
  learnMore: z.strictObject({ label: z.string().min(1), url: z.url() }).optional(),
});
export type GlossaryTerm = z.infer<typeof GlossaryTermSchema>;

/** One first-play tour step; `target` names the UI element to highlight (agreed with the web app). */
export const TourStepSchema = z.strictObject({
  id: Id,
  title: z.string().min(1),
  text: z.string().min(1),
  target: Id,
});
export type TourStep = z.infer<typeof TourStepSchema>;

/**
 * When an advisor line is shown: a fixed trigger, or `requirement-failed:R<n>`.
 * "request" lines are the advisor's suggested request in solo play (design.md section 3.4).
 */
export const AdvisorTriggerSchema = z.union([
  z.enum([
    "intro",
    "mass-over",
    "power-short",
    "budget-over",
    "low-trl",
    "low-reliability",
    "deadline-risk",
    "request",
    "all-requirements-met",
  ]),
  z.templateLiteral(["requirement-failed:", z.enum(["R", "L"]), z.int().positive()]),
]);
export type AdvisorTrigger = z.infer<typeof AdvisorTriggerSchema>;

export const AdvisorLineSchema = z.strictObject({
  id: Id,
  /** "any": spoken by whichever role the situation applies to. */
  role: z.union([RoleSchema, z.literal("any")]),
  when: AdvisorTriggerSchema,
  /** Shown only in this mission; lines without it apply to every mission. */
  missionId: z.string().min(1).optional(),
  text: z.string().min(1),
});
export type AdvisorLine = z.infer<typeof AdvisorLineSchema>;

export const LearningFileSchema = z.strictObject({
  glossary: z.array(GlossaryTermSchema).min(1).superRefine(uniqueBy("id")),
  tour: z.array(TourStepSchema).min(5).max(6).superRefine(uniqueBy("id")),
  advisorLines: z.array(AdvisorLineSchema).min(1).superRefine(uniqueBy("id")),
  sources: z.array(SourceSchema).min(1),
});

const parsed = LearningFileSchema.parse(rawLearning);

/** Validated learning texts. Parsing throws at import time if the JSON is invalid. */
export const glossary: readonly GlossaryTerm[] = parsed.glossary;
export const tourSteps: readonly TourStep[] = parsed.tour;
export const advisorLines: readonly AdvisorLine[] = parsed.advisorLines;

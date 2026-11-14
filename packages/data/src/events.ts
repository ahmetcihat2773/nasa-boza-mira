import { z } from "zod";
import rawEvents from "../json/events.json" with { type: "json" };
import { RoleSchema } from "./missionCards.ts";
import { SourceSchema } from "./sources.ts";
import { uniqueBy } from "./unique.ts";

export const EventPhaseSchema = z.enum(["development", "launch", "operations"]);
export type EventPhase = z.infer<typeof EventPhaseSchema>;

/** The design margin an event tests (design.md section 6.2). */
export const EventMarginSchema = z.enum([
  "schedule",
  "trl",
  "deadline",
  "launcher-reliability",
  "power",
  "propulsion",
  "redundancy",
  "comms",
  "data-capacity",
]);
export type EventMargin = z.infer<typeof EventMarginSchema>;

/** What an option does; see `effectsNote` in events.json for each field's meaning. */
export const EventEffectsSchema = z.strictObject({
  months: z.number().positive().optional(),
  costUsd: z.int().positive().optional(),
  scienceDaysLost: z.number().positive().optional(),
  failureRiskPct: z.number().positive().max(100).optional(),
  performancePct: z.number().min(-100).max(100).optional(),
  sciencePct: z.number().min(-100).max(100).optional(),
  dataBacklogDays: z.number().positive().optional(),
  propulsionUsePct: z.number().positive().max(100).optional(),
  endsMission: z.literal(true).optional(),
});
export type EventEffects = z.infer<typeof EventEffectsSchema>;

export const EventOptionSchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  label: z.string().min(1),
  /** Offered only when the design has this: propulsion, a backup part, or spare data/power margin. */
  requires: z.enum(["propulsion", "redundancy", "margin"]).optional(),
  effects: EventEffectsSchema,
  /** Report line when this option is chosen. */
  outcome: z.string().min(1),
});
export type EventOption = z.infer<typeof EventOptionSchema>;

/**
 * One random event. `rolled: "pool"` events are drawn by weight (3–5 per run);
 * `"once-per-run"` is rolled separately (launch failure, from the launcher's success rate).
 * `decidedBy: null` means no decision: the single option applies. `absorbedText` is used when the margin is enough.
 */
export const GameEventSchema = z
  .strictObject({
    id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
    missionId: z.string().min(1),
    phase: EventPhaseSchema,
    name: z.string().min(1),
    margin: EventMarginSchema,
    decidedBy: RoleSchema.nullable(),
    rolled: z.enum(["pool", "once-per-run"]),
    weight: z.number().nonnegative(),
    text: z.string().min(1),
    why: z.string().min(1),
    absorbedText: z.string().min(1),
    options: z.array(EventOptionSchema).min(1).superRefine(uniqueBy("id")),
  })
  .superRefine((e, ctx) => {
    if (e.decidedBy === null && e.options.length !== 1)
      ctx.addIssue({
        code: "custom",
        path: ["options"],
        message: "an event without a decision has exactly one option",
      });
    if (e.decidedBy !== null && e.options.length < 2)
      ctx.addIssue({ code: "custom", path: ["options"], message: "a decision needs at least two options" });
    if (e.rolled === "pool" && e.weight <= 0)
      ctx.addIssue({ code: "custom", path: ["weight"], message: "pool events need a positive weight" });
  });
export type GameEvent = z.infer<typeof GameEventSchema>;

export const EventsFileSchema = z.strictObject({
  effectsNote: z.string().min(1),
  events: z.array(GameEventSchema).min(1).superRefine(uniqueBy("id")),
  sources: z.array(SourceSchema).min(1),
});

/** The validated event list. Parsing throws at import time if the JSON is invalid. */
export const gameEvents: readonly GameEvent[] = EventsFileSchema.parse(rawEvents).events;

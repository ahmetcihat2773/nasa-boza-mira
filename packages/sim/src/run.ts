/**
 * Mission run (T14): a seeded, deterministic walk through development, launch and operations,
 * with random events, team decisions, the score, a plain-English cause chain and the nearest real mission.
 */
import {
  gameEvents,
  realMissions,
  type EventEffects,
  type EventOption,
  type EventPhase,
  type GameEvent,
  type Metric,
  type RealMission,
  type RequirementCheck,
  type Role,
} from "@space-mission/data";
import {
  LIFETIME_TABLE,
  computeBudget,
  formatUsd,
  trlPenaltyMonths,
  type Budget,
  type Design,
  type Mission,
} from "./budget.ts";
import { maxPassMinutes, missionLifetime } from "./earth-orbit.ts";
import { lunarLatencyHours } from "./lunar.ts";

// ---------- Seeded random numbers ----------

/** 32-bit string hash (FNV-1a). */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Mulberry32: a small, fast seeded generator returning numbers in [0, 1). */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * One random number per named roll. Rolls are independent of each other and of the team's decisions,
 * so changing a decision never changes which events happen or how other rolls land.
 */
export function roll(seed: number | string, key: string): number {
  return seededRandom(hash(`${seed}|${key}`))();
}

// ---------- Events ----------

const PHASES: readonly EventPhase[] = ["development", "launch", "operations"];
export const MIN_EVENTS = 3;
export const MAX_EVENTS = 5;

/** The 3–5 pool events of a run, drawn by weight without replacement, in phase order. */
export function drawEvents(mission: Mission, seed: number | string): GameEvent[] {
  const pool = gameEvents.filter((e) => e.missions.includes(mission.id) && e.rolled === "pool");
  const rng = seededRandom(hash(`${seed}|events`));
  const count = Math.min(pool.length, MIN_EVENTS + Math.floor(rng() * (MAX_EVENTS - MIN_EVENTS + 1)));
  const left = [...pool];
  const drawn: GameEvent[] = [];
  while (drawn.length < count) {
    const total = left.reduce((s, e) => s + e.weight, 0);
    let r = rng() * total;
    let i = 0;
    while (i < left.length - 1 && r >= left[i]!.weight) r -= left[i++]!.weight;
    drawn.push(left.splice(i, 1)[0]!);
  }
  return drawn.sort((a, b) => PHASES.indexOf(a.phase) - PHASES.indexOf(b.phase));
}

/** Chance per run that a part of this TRL fails in orbit. */
export function trlFailureChance(trl: number): number {
  if (trl >= 9) return 0.02;
  if (trl >= 7) return 0.05;
  if (trl >= 5) return 0.12;
  return 0.25;
}

/** Average hours from an observation to the next ground contact (passes are on average 70% of the longest). */
export function alertLatencyHours(contactMinutesPerDay: number, altitudeKm: number): number {
  const passes = contactMinutesPerDay / (0.7 * maxPassMinutes(altitudeKm));
  return passes > 0 ? 24 / (2 * passes) : Infinity;
}

/** Team decisions: event id → option id. Missing or unavailable choices fall back to the first available option. */
export type Decisions = Readonly<Record<string, string>>;

/** Coordination facts from the negotiation phase (design.md section 3.5). */
export interface Coordination {
  /** Accepted requests that paid off. */
  requestsPaidOff?: number;
  /** Trades that helped both sides. */
  tradesHelped?: number;
}

export interface RunEvent {
  event: GameEvent;
  /** The design's margin absorbed the event: no decision, no effect (except a bonus for major-fire-season). */
  absorbed: boolean;
  /** Options this design can choose (respecting `requires`); empty when absorbed. */
  available: EventOption[];
  chosen: EventOption | null;
  /** Who decides; null when there is no decision. */
  decidedBy: Role | null;
  /** True when no valid team decision was given and the default (first available) option was used. */
  usedDefault: boolean;
  /** The effects that applied. */
  effects: EventEffects;
  /** Report line. */
  text: string;
  /** Set when an added failure risk was rolled and the mission was lost. */
  lostMission: boolean;
}

interface Margins {
  slackMonths: number;
  allTrl9: boolean;
  powerMargin: number;
  radTolerant: boolean;
  hasPropulsion: boolean;
  hasRedundancy: boolean;
  dataMargin: boolean;
  /** Downlink still meets the data requirement with the busiest station out. */
  commsSpare: boolean;
  partFailureChance: number;
  /** Delta-v left after insertion and the required station-keeping, km/s (lunar missions). */
  deltaVMarginKmS: number;
  /** TRL of the propulsion part (lunar missions). */
  propulsionTrl: number;
}

function margins(design: Design, b: Budget, mission: Mission): Margins {
  const parts = Object.values(design.parts).filter((p) => p !== undefined);
  const rated = [...parts, ...(design.instruments ?? [])];
  const contactOf = (g: (typeof b.groundStations)[number]) =>
    mission.destination === "lunar-orbit"
      ? (g.lunarContactMinutesPerDay ?? 0)
      : (g.contactMinutesPerDay[b.orbit.type] ?? 0);
  const busiest = Math.max(0, ...b.groundStations.map(contactOf));
  const spareCapacity =
    b.contactMinutesPerDay > 0
      ? (b.downlinkCapacityGbPerDay * (b.contactMinutesPerDay - busiest)) / b.contactMinutesPerDay
      : 0;
  const avgDrawn =
    b.orbitPower.eclipseMinutes > 0 ? (b.orbitPower.eclipseEnergyWh * 60) / b.orbitPower.eclipseMinutes : 0;
  return {
    slackMonths: mission.deadlineMonths - b.devMonths,
    allTrl9: rated.every((p) => p.trl >= 9),
    powerMargin: avgDrawn > 0 ? b.orbitPower.averageProducedW / avgDrawn - 1 : 1,
    radTolerant: (design.parts.obc?.performance.value ?? 0) >= 20,
    hasPropulsion: (design.parts.propulsion?.performance.value ?? 0) > 0,
    hasRedundancy: parts.some((p) => p.id.includes("redundant")),
    dataMargin: b.downlinkCapacityGbPerDay >= 1.5 * mission.thresholds.minDownlinkGbPerDay && b.orbitPower.energyOk,
    commsSpare: b.groundStations.length > 1 && spareCapacity >= mission.thresholds.minDownlinkGbPerDay,
    partFailureChance: 1 - rated.reduce((s, p) => s * (1 - trlFailureChance(p.trl)), 1),
    deltaVMarginKmS: b.deltaV?.marginKmS ?? 0,
    propulsionTrl: design.parts.propulsion?.trl ?? 0,
  };
}

function isAbsorbed(e: GameEvent, m: Margins, seed: number | string): boolean {
  const maxMonths = Math.max(0, ...e.options.map((o) => o.effects.months ?? 0));
  switch (e.margin) {
    case "schedule":
    case "deadline":
      return m.slackMonths >= maxMonths;
    case "trl":
      return m.allTrl9;
    case "power":
      return m.radTolerant && m.powerMargin >= 0.2;
    case "propulsion":
      return roll(seed, `${e.id}|miss`) < 0.5;
    case "redundancy":
      return roll(seed, `${e.id}|fail`) >= m.partFailureChance;
    case "comms":
      return m.commsSpare;
    case "data-capacity":
      return m.dataMargin;
    case "delta-v":
      return m.deltaVMarginKmS >= 0.15;
    case "propulsion-trl":
      return m.propulsionTrl >= 8;
    default:
      return false;
  }
}

function optionAvailable(o: EventOption, m: Margins): boolean {
  if (o.requires === "propulsion") return m.hasPropulsion;
  if (o.requires === "redundancy") return m.hasRedundancy;
  if (o.requires === "margin") return m.dataMargin;
  return true;
}

/**
 * The events of a run with the options this design can choose, before any decision.
 * The UI asks the deciding role for each event with `available.length > 1`, then passes the answers to runMission.
 */
export function planEvents(
  design: Design,
  mission: Mission,
  seed: number | string,
  decisions: Decisions = {},
): RunEvent[] {
  const b = computeBudget(design, mission);
  const m = margins(design, b, mission);
  return drawEvents(mission, seed).map((event) => {
    if (isAbsorbed(event, m, seed)) {
      const bonus: EventEffects = event.margin === "data-capacity" ? { sciencePct: 10 } : {};
      return {
        event,
        absorbed: true,
        available: [],
        chosen: null,
        decidedBy: null,
        usedDefault: false,
        effects: bonus,
        text: event.absorbedText,
        lostMission: false,
      };
    }
    const available = event.options.filter((o) => optionAvailable(o, m));
    const wanted = available.find((o) => o.id === decisions[event.id]);
    const chosen = wanted ?? available[0] ?? event.options[0]!;
    const lostMission =
      chosen.effects.endsMission === true ||
      (chosen.effects.failureRiskPct !== undefined &&
        roll(seed, `${event.id}|risk`) < chosen.effects.failureRiskPct / 100);
    return {
      event,
      absorbed: false,
      available,
      chosen,
      decidedBy: event.decidedBy,
      usedDefault: !wanted && event.decidedBy !== null,
      effects: chosen.effects,
      text: `${event.text} ${chosen.outcome}${lostMission && !chosen.effects.endsMission ? " The risk did not pay off: the satellite was lost." : ""}`,
      lostMission,
    };
  });
}

// ---------- Real-mission match (T14.6) ----------

export interface RealMissionMatch {
  mission: RealMission;
  /** Plain-English reason for the match. */
  reason: string;
}

/** The real mission closest to the design: orbit type, altitude, mass, instrument kind and fire detection. */
export function nearestRealMission(design: Design, b: Budget): RealMissionMatch {
  const kinds = new Set((design.instruments ?? []).map((i) => i.kind));
  const detectsFire = (design.instruments ?? []).some(
    (i) => i.detects.includes("daylightFire") || i.detects.includes("nightFire"),
  );
  const mass = Math.max(1, b.massKg);
  const distance = (r: RealMission) =>
    (r.orbitType === b.orbit.type ? 0 : 1) +
    Math.abs(r.altitudeKm - b.orbit.altitudeKm) / 300 +
    Math.abs(Math.log10(r.massKg / mass)) +
    (kinds.has(r.instrumentKind) ? 0 : 0.5) +
    (r.detectsFire === detectsFire ? 0 : 0.5);
  const best = [...realMissions].sort((x, y) => distance(x) - distance(y) || x.id.localeCompare(y.id))[0]!;
  const same: string[] = [];
  if (best.orbitType === b.orbit.type) same.push(`a ${best.orbitType} orbit`);
  if (Math.abs(Math.log10(best.massKg / mass)) < 0.5) same.push(`a similar mass (${best.massKg} kg)`);
  if (kinds.has(best.instrumentKind)) same.push(`a ${best.instrumentKind} instrument`);
  return {
    mission: best,
    reason: `Your design resembles ${best.name} (${best.agency}, ${best.launchYear})${same.length ? `: ${same.join(", ")}` : ""}. ${best.summary}`,
  };
}

// ---------- Scoring and the run (T14.1–T14.5) ----------

export type ScoreComponentId = "science" | "efficiency" | "schedule" | "risk" | "coordination";

export interface ScoreComponent {
  id: ScoreComponentId;
  /** Weight in percent, from the mission card. */
  weight: number;
  /** 0–100. */
  value: number;
  /** Points out of 1000 (value × weight / 10). */
  points: number;
  explanation: string;
}

export interface Score {
  /** 0–1000. */
  total: number;
  stars: 1 | 2 | 3;
  components: ScoreComponent[];
}

export interface Cause {
  phase: "design" | EventPhase | "result";
  tone: "good" | "bad" | "neutral";
  text: string;
}

export interface BonusResult {
  id: string;
  name: string;
  met: boolean;
}

export interface MissionResult {
  seed: number | string;
  budget: Budget;
  events: RunEvent[];
  launch: { successRate: number; roll: number; ok: boolean } | null;
  success: boolean;
  /** Plain-English reasons the mission failed (empty on success). */
  failureReasons: string[];
  /** Development plus event delays, months. */
  devMonths: number;
  delayMonths: number;
  waitMonths: number;
  readyMonths: number;
  deadlineMet: boolean;
  extraCostUsd: number;
  totalCostUsd: number;
  budgetLeftUsd: number;
  bonuses: BonusResult[];
  /** null when the mission failed. */
  score: Score | null;
  causes: Cause[];
  realMission: RealMissionMatch;
}

/** Stars from the total score. */
export function starsFor(total: number): 1 | 2 | 3 {
  return total >= 750 ? 3 : total >= 500 ? 2 : 1;
}

const clamp = (x: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, x));

/** Use of a capacity: best between 60% and 90%, worse when large capacity sits unused or the margin is gone. */
function usageScore(used: number, capacity: number | null): number {
  if (!capacity || capacity <= 0) return 0;
  const u = used / capacity;
  if (u > 1) return 0;
  if (u >= 0.6 && u <= 0.9) return 100;
  return u < 0.6 ? (u / 0.6) * 100 : 100 - ((u - 0.9) / 0.1) * 50;
}

function metricValue(metric: Metric, design: Design, b: Budget, latency: number): number {
  switch (metric) {
    case "revisitsPerDay":
      return b.revisitsPerDay;
    case "downlinkGbPerDay":
      return b.downlinkCapacityGbPerDay;
    case "lifetimeYears":
      return b.lifetimeYears;
    case "alertLatencyHours":
      return latency;
    case "inclinationDeg":
      return b.orbit.inclinationDeg;
    case "altitudeKm":
      return b.orbit.altitudeKm;
    case "deltaVMarginKmS":
      return b.deltaV?.marginKmS ?? -Infinity;
    case "iceDetectionMethods":
      return new Set((design.instruments ?? []).filter((i) => i.detects.includes("waterIce")).map((i) => i.kind)).size;
  }
}

function checkMet(c: RequirementCheck, design: Design, b: Budget, latency: number): boolean {
  if (c.kind === "detects") return (design.instruments ?? []).some((i) => i.detects.includes(c.detection));
  const v = metricValue(c.metric, design, b, latency);
  return c.kind === "min" ? v >= c.value : v <= c.value;
}

/**
 * Runs a mission. Deterministic: the same design, mission, seed, decisions and coordination give the same result.
 * Without decisions, every event uses its default (first available) option.
 */
export function runMission(
  design: Design,
  mission: Mission,
  seed: number | string,
  decisions: Decisions = {},
  coordination: Coordination = {},
): MissionResult {
  const b = computeBudget(design, mission);
  const causes: Cause[] = [];
  const failureReasons: string[] = [];
  const latency =
    mission.destination === "lunar-orbit"
      ? lunarLatencyHours(b.lunar?.stationWindowMinutesPerDay ?? b.contactMinutesPerDay, b.orbit.altitudeKm)
      : alertLatencyHours(b.contactMinutesPerDay, b.orbit.altitudeKm);
  const bonuses: BonusResult[] = mission.card.bonusObjectives.map((o) => ({
    id: o.id,
    name: o.name,
    met: checkMet(o.check, design, b, latency),
  }));
  const realMission = nearestRealMission(design, b);

  for (const c of b.checks) if (!c.ok) causes.push({ phase: "design", tone: "bad", text: c.message });

  const base = {
    seed,
    budget: b,
    devMonths: b.devMonths,
    bonuses,
    realMission,
  };

  // Success gate, part 1: the design must pass every blocking check (requirements, mass, power, budget).
  if (!b.pass) {
    for (const c of b.checks) if (!c.ok && c.blocking) failureReasons.push(c.message);
    causes.push({
      phase: "result",
      tone: "bad",
      text: "The design did not pass its review, so the mission could not fly.",
    });
    return {
      ...base,
      events: [],
      launch: null,
      success: false,
      failureReasons,
      delayMonths: 0,
      waitMonths: b.deadline.waitMonths,
      readyMonths: b.deadline.readyMonths,
      deadlineMet: b.deadline.met,
      extraCostUsd: 0,
      totalCostUsd: b.totalCostUsd,
      budgetLeftUsd: mission.budgetUsd - b.totalCostUsd,
      score: null,
      causes,
    };
  }

  const planned = planEvents(design, mission, seed, decisions);
  const events: RunEvent[] = [];
  let lost = false;
  let launch: MissionResult["launch"] = null;

  const runPhase = (phase: EventPhase) => {
    for (const ev of planned.filter((e) => e.event.phase === phase)) {
      if (lost) return;
      events.push(ev);
      causes.push({ phase, tone: ev.absorbed ? "good" : ev.lostMission ? "bad" : "neutral", text: ev.text });
      if (ev.lostMission) {
        lost = true;
        failureReasons.push(`${ev.event.name}: ${ev.chosen?.label ?? ""} – the satellite was lost.`);
      }
    }
  };

  runPhase("development");
  runPhase("launch");
  // Launch failure: rolled once per run from the launcher's success rate (T14.2).
  if (!lost && design.launcher) {
    const successRate = design.launcher.successRate;
    const r = roll(seed, "launch");
    launch = { successRate, roll: r, ok: r < successRate };
    const failEvent = gameEvents.find((e) => e.missionId === mission.id && e.margin === "launcher-reliability");
    if (launch.ok) {
      causes.push({ phase: "launch", tone: "good", text: failEvent?.absorbedText ?? "The launch succeeded." });
    } else {
      lost = true;
      const text = `${failEvent?.options[0]?.outcome ?? "The satellite was lost at launch."} The ${design.launcher.name} succeeds ${Math.round(successRate * 100)}% of the time.`;
      failureReasons.push(text);
      causes.push({ phase: "launch", tone: "bad", text });
    }
  }
  runPhase("operations");

  // Propellant spent during events shortens the mission: station-keeping at the Moon,
  // the propulsion-extended lifetime in Earth orbit. Ending below the required lifetime loses the mission.
  const fuelUsedPct = events.reduce((s, e) => s + (e.effects.propulsionUsePct ?? 0), 0);
  if (!lost && fuelUsedPct > 0 && design.parts.propulsion) {
    const share = 1 - fuelUsedPct / 100;
    const years =
      mission.destination === "lunar-orbit" && b.deltaV
        ? Math.max(0, (b.deltaV.availableKmS * share - b.deltaV.loiKmS) / b.deltaV.stationKeepingKmSPerYear)
        : missionLifetime(
            b.orbit.altitudeKm,
            { totalImpulseNs: design.parts.propulsion.performance.value * share, massKg: b.massKg },
            LIFETIME_TABLE,
          ).years;
    const note = `Correction burns used ${fuelUsedPct}% of the propellant: the orbit now holds for about ${years.toFixed(1)} years.`;
    if (years < mission.thresholds.minLifetimeYears) {
      lost = true;
      const msg = `The orbit decayed before the mission's ${mission.thresholds.minLifetimeYears} years were up. ${note}`;
      failureReasons.push(msg);
      causes.push({ phase: "operations", tone: "bad", text: msg });
    } else {
      causes.push({ phase: "operations", tone: "neutral", text: note });
    }
  }

  // Time and money after the events (T13.4 deadline rule on the delayed schedule).
  const sum = (k: keyof EventEffects) => events.reduce((s, e) => s + ((e.effects[k] as number | undefined) ?? 0), 0);
  const delayMonths = sum("months");
  const devMonths = b.devMonths + delayMonths;
  const lateBy = Math.max(0, devMonths - mission.deadlineMonths);
  const waitMonths =
    lateBy > 0 && mission.lateWaitMonths > 0 ? Math.ceil(lateBy / mission.lateWaitMonths) * mission.lateWaitMonths : 0;
  const readyMonths = devMonths + waitMonths;
  const deadlineMet = lateBy === 0;
  const extraCostUsd = sum("costUsd");
  const teamCostUsd = readyMonths * mission.teamCostPerMonthUsd;
  const totalCostUsd = b.totalCostUsd - b.teamCostUsd + teamCostUsd + extraCostUsd;
  const budgetLeftUsd = mission.budgetUsd - totalCostUsd;

  if (!deadlineMet) {
    causes.push({
      phase: "development",
      tone: "bad",
      text: `The ${mission.deadlineMonths}-month deadline was missed (ready after ${devMonths} months), and the ${waitMonths}-month wait cost ${formatUsd(waitMonths * mission.teamCostPerMonthUsd)} of the budget.`,
    });
  }
  if (budgetLeftUsd < 0) {
    const text = `The budget ran out: the mission cost ${formatUsd(totalCostUsd)} of ${formatUsd(mission.budgetUsd)}.`;
    failureReasons.push(text);
    causes.push({ phase: "result", tone: "bad", text });
  }

  const success = !lost && budgetLeftUsd >= 0;
  let score: Score | null = null;
  if (success) {
    score = scoreMission(
      design,
      mission,
      b,
      events,
      bonuses,
      { deadlineMet, readyMonths, budgetLeftUsd },
      coordination,
    );
    for (const c of score.components)
      causes.push({ phase: "result", tone: c.value >= 60 ? "good" : "neutral", text: c.explanation });
    causes.push({
      phase: "result",
      tone: "good",
      text: `Mission success: ${score.total} points, ${score.stars} star${score.stars > 1 ? "s" : ""}.`,
    });
  } else {
    causes.push({ phase: "result", tone: "bad", text: "Mission failed." });
  }

  return {
    ...base,
    events,
    launch,
    success,
    failureReasons,
    devMonths,
    delayMonths,
    waitMonths,
    readyMonths,
    deadlineMet,
    extraCostUsd,
    totalCostUsd,
    budgetLeftUsd,
    score,
    causes,
  };
}

function scoreMission(
  design: Design,
  mission: Mission,
  b: Budget,
  events: RunEvent[],
  bonuses: BonusResult[],
  t: { deadlineMet: boolean; readyMonths: number; budgetLeftUsd: number },
  coordination: Coordination,
): Score {
  const w = mission.card.scoreWeights;
  const fx = (k: keyof EventEffects) => events.reduce((s, e) => s + ((e.effects[k] as number | undefined) ?? 0), 0);

  // Science: the best instrument, a quarter of the others, bonus objectives, then event effects.
  const values = (design.instruments ?? [])
    .map((i) => (i.scienceValue as Record<string, number>)[mission.scienceKey] ?? 0)
    .sort((x, y) => y - x);
  const instrumentValue = (values[0] ?? 0) + 0.25 * values.slice(1).reduce((s, v) => s + v, 0);
  const metBonuses = bonuses.filter((x) => x.met);
  const eventSciencePct =
    fx("sciencePct") + fx("performancePct") / 2 - fx("scienceDaysLost") - fx("dataBacklogDays") / 2;
  const science = clamp((instrumentValue + 10 * metBonuses.length) * (1 + eventSciencePct / 100));

  // Efficiency: budget left (full marks from 40% left), and mass and power use.
  const leftShare = t.budgetLeftUsd / mission.budgetUsd;
  const budgetScore = clamp((leftShare / 0.4) * 100);
  const massCapacity = Math.min(b.maxMassKg ?? Infinity, b.launcherCapacityKg ?? Infinity);
  const massScore = usageScore(b.massKg, Number.isFinite(massCapacity) ? massCapacity : null);
  const powerScore = usageScore(b.powerDrawnW, b.powerProducedW);
  const efficiency = clamp(0.5 * budgetScore + 0.25 * massScore + 0.25 * powerScore);

  // Schedule: zero when late, full marks when ready half the deadline early.
  const slack = mission.deadlineMonths - t.readyMonths;
  const schedule = t.deadlineMet ? clamp((slack / (mission.deadlineMonths / 2)) * 100) : 0;

  // Risk: start from 100, lose points for risks taken, damage and immature parts.
  const lowTrl = [...Object.values(design.parts), ...(design.instruments ?? [])].filter(
    (p) => p && (trlPenaltyMonths(p.trl) ?? 9) >= 9,
  ).length;
  const absorbed = events.filter((e) => e.absorbed).length;
  const risk = clamp(
    100 -
      2 * fx("failureRiskPct") -
      2 * fx("dataBacklogDays") -
      3 * fx("scienceDaysLost") -
      Math.abs(Math.min(0, fx("performancePct"))) / 2 -
      Math.abs(Math.min(0, fx("sciencePct"))) -
      5 * lowTrl,
  );

  // Coordination: base 70, plus requests and trades that paid off, minus roles over their allocation.
  const overRoles = (Object.keys(b.spendByRole) as (keyof typeof b.spendByRole)[]).filter(
    (r) => b.spendByRole[r] > b.allocationByRole[r],
  );
  const paid = coordination.requestsPaidOff ?? 0;
  const trades = coordination.tradesHelped ?? 0;
  const coord = clamp(70 + 15 * paid + 15 * trades - 30 * overRoles.length);

  const pct = (x: number) => Math.round(x);
  const components: ScoreComponent[] = [
    {
      id: "science",
      weight: w.science,
      value: science,
      points: 0,
      explanation: `Science ${pct(science)}/100: instrument value ${pct(instrumentValue)}${metBonuses.length ? `, bonus objectives met: ${metBonuses.map((x) => x.name).join(", ")}` : ", no bonus objectives met"}${eventSciencePct ? `, events changed science by ${pct(eventSciencePct)}%` : ""}.`,
    },
    {
      id: "efficiency",
      weight: w.efficiency,
      value: efficiency,
      points: 0,
      explanation: `Efficiency ${pct(efficiency)}/100: ${formatUsd(t.budgetLeftUsd)} of the budget left, ${pct(Number.isFinite(massCapacity) ? (100 * b.massKg) / massCapacity : 0)}% of the mass limit and ${pct(b.powerProducedW ? (100 * b.powerDrawnW) / b.powerProducedW : 0)}% of peak power used.`,
    },
    {
      id: "schedule",
      weight: w.schedule,
      value: schedule,
      points: 0,
      explanation: t.deadlineMet
        ? `Schedule ${pct(schedule)}/100: ready ${slack} months before the deadline.`
        : "Schedule 0/100: the deadline was missed.",
    },
    {
      id: "risk",
      weight: w.risk,
      value: risk,
      points: 0,
      explanation: `Risk ${pct(risk)}/100: ${absorbed} of ${events.length} events absorbed by the design${lowTrl ? `, ${lowTrl} low-TRL part${lowTrl > 1 ? "s" : ""} carried` : ""}.`,
    },
    {
      id: "coordination",
      weight: w.coordination,
      value: coord,
      points: 0,
      explanation: `Coordination ${pct(coord)}/100: ${paid} request${paid === 1 ? "" : "s"} and ${trades} trade${trades === 1 ? "" : "s"} paid off${overRoles.length ? `; over allocation: ${overRoles.join(", ")}` : "; every role stayed within its allocation"}.`,
    },
  ];
  for (const c of components) c.points = Math.round((c.value * c.weight) / 10);
  const total = components.reduce((s, c) => s + c.points, 0);
  return { total, stars: starsFor(total), components };
}

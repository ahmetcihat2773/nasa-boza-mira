/**
 * AI Mission Control (two-agent demo): one mission, one expected problem.
 *
 * - Agent 1, the Mission Designer, picks parts so the mission meets every requirement AND can
 *   recover from the expected launch problem (check C1).
 * - Agent 2, the Mission Monitor, watches the launch telemetry, spots the problem and picks a fix.
 *
 * Everything here is pure and deterministic: the API wraps it with Claude, and both the API and the
 * web app use the built-in agents below when Claude is not available.
 */
import {
  allLaunchers,
  groundStations as allStations,
  instruments as allInstruments,
  launchersFor,
  orbitTypes,
  parts as allParts,
  type Subsystem,
} from "@space-mission/data";
import {
  LIFETIME_TABLE,
  SUBSYSTEMS,
  computeBudget,
  missionById,
  stationKind,
  type Budget,
  type Design,
  type Mission,
} from "./budget.ts";
import { decayLifetimeYears, missionLifetime, orbitalSpeedKmS } from "./earth-orbit.ts";
import { EARTH_MU_KM3_S2, EARTH_RADIUS_KM } from "./orbit.ts";

// ---------- The scenario ----------

export interface AutopilotScenario {
  missionId: string;
  anomaly: {
    id: string;
    name: string;
    /** How far below the planned orbit the rocket leaves the spacecraft, km. */
    shortfallKm: number;
    /** What the team is told before the launch (the known risk). */
    risk: string;
    /** Why this happens, in plain words. */
    why: string;
  };
  /** Altitude error that the monitor treats as an anomaly, km. */
  detectThresholdKm: number;
  /** Delta-v the design must carry above the recovery need (0.1 = 10%). */
  recoveryMargin: number;
}

export const AUTOPILOT_SCENARIO: AutopilotScenario = {
  missionId: "wildfire-watch",
  anomaly: {
    id: "low-insertion",
    name: "Low orbit insertion",
    shortfallKm: 150,
    risk: "The rocket's upper stage may run short and release the spacecraft up to 150 km below its planned orbit.",
    why: "If a rocket stage burns a little short, the spacecraft is released lower than planned. Lower orbits have more air drag, so the spacecraft falls back to Earth much sooner unless it can climb with its own thruster.",
  },
  detectThresholdKm: 20,
  recoveryMargin: 0.1,
};

export const autopilotMission = (s: AutopilotScenario = AUTOPILOT_SCENARIO): Mission => missionById(s.missionId);

// ---------- Orbit raising ----------

/** Delta-v of a two-burn (Hohmann) transfer between circular orbits, m/s. */
export function hohmannDeltaVMs(fromKm: number, toKm: number): number {
  const r1 = EARTH_RADIUS_KM + fromKm;
  const r2 = EARTH_RADIUS_KM + toKm;
  const a = (r1 + r2) / 2;
  const v1 = Math.sqrt(EARTH_MU_KM3_S2 / r1);
  const v2 = Math.sqrt(EARTH_MU_KM3_S2 / r2);
  const vp = Math.sqrt(EARTH_MU_KM3_S2 * (2 / r1 - 1 / a));
  const va = Math.sqrt(EARTH_MU_KM3_S2 * (2 / r2 - 1 / a));
  return (Math.abs(vp - v1) + Math.abs(v2 - va)) * 1000;
}

/** Delta-v the thruster can give the spacecraft, m/s (total impulse / mass, as in missionLifetime). */
export function propulsionDeltaVMs(design: Design, b: Budget): number {
  const ns = design.parts.propulsion?.performance.value ?? 0;
  return b.massKg > 0 ? ns / b.massKg : 0;
}

export interface Recovery {
  plannedAltitudeKm: number;
  insertedAltitudeKm: number;
  neededMs: number;
  /** neededMs plus the margin. */
  requiredMs: number;
  availableMs: number;
  ok: boolean;
}

/** Can the design climb back from the expected low insertion? */
export function recoveryFor(design: Design, b: Budget, s: AutopilotScenario = AUTOPILOT_SCENARIO): Recovery {
  const planned = b.orbit.altitudeKm;
  const inserted = planned - s.anomaly.shortfallKm;
  const neededMs = hohmannDeltaVMs(inserted, planned);
  const requiredMs = neededMs * (1 + s.recoveryMargin);
  const availableMs = propulsionDeltaVMs(design, b);
  return {
    plannedAltitudeKm: planned,
    insertedAltitudeKm: inserted,
    neededMs,
    requiredMs,
    availableMs,
    ok: availableMs >= requiredMs,
  };
}

// ---------- Evaluation (what Agent 1 must satisfy) ----------

export interface AutopilotCheck {
  id: string;
  ok: boolean;
  blocking: boolean;
  message: string;
}

export interface Evaluation {
  budget: Budget;
  recovery: Recovery;
  checks: AutopilotCheck[];
  /** Blocking checks that fail (sim checks plus C1). */
  failures: AutopilotCheck[];
  pass: boolean;
}

export function evaluateDesign(
  design: Design,
  mission: Mission,
  s: AutopilotScenario = AUTOPILOT_SCENARIO,
): Evaluation {
  const budget = computeBudget(design, mission);
  const recovery = recoveryFor(design, budget, s);
  const c1: AutopilotCheck = {
    id: "C1",
    ok: recovery.ok,
    blocking: true,
    message: recovery.ok
      ? `C1 met: the thruster gives ${recovery.availableMs.toFixed(0)} m/s, enough to climb back from ${recovery.insertedAltitudeKm} km to ${recovery.plannedAltitudeKm} km (${recovery.neededMs.toFixed(0)} m/s plus a ${Math.round(s.recoveryMargin * 100)}% margin).`
      : `C1 not met: climbing back from ${recovery.insertedAltitudeKm} km to ${recovery.plannedAltitudeKm} km needs ${recovery.requiredMs.toFixed(0)} m/s (with margin), but the thruster gives only ${recovery.availableMs.toFixed(0)} m/s.`,
  };
  const checks: AutopilotCheck[] = [...budget.checks, c1];
  const failures = checks.filter((c) => !c.ok && c.blocking);
  return { budget, recovery, checks, failures, pass: failures.length === 0 };
}

// ---------- Designs as ids (what agents read and write) ----------

export interface DesignIds {
  parts: Partial<Record<Subsystem, string>>;
  instruments: string[];
  launcher?: string;
  /** Checked against the orbit types in fromDesignIds. */
  orbit?: { type: string; altitudeKm: number };
  groundStations?: string[];
}

export function toDesignIds(d: Design): DesignIds {
  const parts: Partial<Record<Subsystem, string>> = {};
  for (const s of SUBSYSTEMS) if (d.parts[s]) parts[s] = d.parts[s]!.id;
  return {
    parts,
    instruments: (d.instruments ?? []).map((i) => i.id),
    ...(d.launcher ? { launcher: String(d.launcher.id) } : {}),
    ...(d.orbit ? { orbit: d.orbit } : {}),
    ...(d.groundStations ? { groundStations: d.groundStations.map((g) => g.id) } : {}),
  };
}

/** Turns ids back into a design. Unknown or misplaced ids are reported, not thrown. */
export function fromDesignIds(ids: DesignIds): { design: Design; problems: string[] } {
  const problems: string[] = [];
  const design: Design = { parts: {} };
  for (const s of SUBSYSTEMS) {
    const id = ids.parts?.[s];
    if (!id) continue;
    const p = allParts.find((x) => x.id === id);
    if (!p) problems.push(`Unknown part id "${id}" for ${s}.`);
    else if (p.subsystem !== s) problems.push(`"${id}" is a ${p.subsystem} part, not a ${s} part.`);
    else design.parts[s] = p;
  }
  design.instruments = [];
  for (const id of ids.instruments ?? []) {
    const i = allInstruments.find((x) => x.id === id);
    if (i) design.instruments.push(i);
    else problems.push(`Unknown instrument id "${id}".`);
  }
  if (ids.launcher !== undefined) {
    const l = allLaunchers.find((x) => String(x.id) === String(ids.launcher));
    if (l) design.launcher = l;
    else problems.push(`Unknown launcher id "${ids.launcher}".`);
  }
  if (ids.orbit && !design.launcher?.fixedOrbit) {
    const type = orbitTypes.find((o) => o.id === ids.orbit!.type)?.id;
    if (type && Number.isFinite(ids.orbit.altitudeKm)) design.orbit = { type, altitudeKm: ids.orbit.altitudeKm };
    else problems.push(`Unknown orbit "${ids.orbit.type}".`);
  }
  if (ids.groundStations) {
    design.groundStations = [];
    for (const id of ids.groundStations) {
      const g = allStations.find((x) => x.id === id);
      if (g) design.groundStations.push(g);
      else problems.push(`Unknown ground station id "${id}".`);
    }
    if (design.groundStations.length === 0) delete design.groundStations;
  }
  return { design, problems };
}

/** Short "subsystem: part" list for the UI and the agents. */
export function describeDesign(d: Design): string[] {
  const out = SUBSYSTEMS.map((s) => `${s}: ${d.parts[s]?.name ?? "-"}`);
  out.push(`instruments: ${(d.instruments ?? []).map((i) => i.name).join(", ") || "-"}`);
  out.push(`launcher: ${d.launcher?.name ?? "-"}`);
  if (d.orbit) out.push(`orbit: ${d.orbit.altitudeKm} km ${d.orbit.type}`);
  if (d.groundStations) out.push(`ground stations: ${d.groundStations.map((g) => g.name).join(", ")}`);
  return out;
}

// ---------- The catalogue as the designer sees it ----------

/** Everything the designer may pick, as compact text lines (for the Claude prompt). */
export function catalogueText(mission: Mission): string {
  const lines: string[] = [];
  lines.push(
    "PARTS (id | subsystem | fits sizes | mass kg | power drawn W | power produced W | cost $M | TRL | performance)",
  );
  for (const p of allParts) {
    lines.push(
      `${p.id} | ${p.subsystem} | ${p.fits.join("/")} | ${p.massKg} | ${p.powerW} | ${p.powerProducedW ?? 0} | ${(p.costUsd / 1e6).toFixed(3)} | ${p.trl} | ${p.performance.value} ${p.performance.unit}`,
    );
  }
  lines.push(
    "",
    "INSTRUMENTS (id | fits | mass kg | power W | cost $M | TRL | detects | data Mbps | field of view deg)",
  );
  for (const i of allInstruments) {
    lines.push(
      `${i.id} | ${i.fits.join("/")} | ${i.massKg} | ${i.powerW} | ${(i.costUsd / 1e6).toFixed(2)} | ${i.trl} | ${i.detects.join("/")} | ${i.dataRateMbps} | ${i.fieldOfViewDeg}`,
    );
  }
  lines.push("", "LAUNCHERS (id | name | capacity to sun-synchronous kg | price | fixed orbit)");
  for (const l of launchersFor(mission.destination)) {
    const price = l.costPerKgUsd
      ? `$${(l.launchCostUsd / 1e6).toFixed(2)}M for ${l.includedKg ?? 0} kg + $${l.costPerKgUsd}/kg`
      : `$${(l.launchCostUsd / 1e6).toFixed(1)}M`;
    const fixed = l.fixedOrbit ? `${l.fixedOrbit.altitudeKm} km ${l.fixedOrbit.type}` : "any (choose orbit)";
    lines.push(`${l.id} | ${l.name} | ${l.ssoCapacityKg ?? l.leoCapacityKg} | ${price} | ${fixed}`);
  }
  lines.push("", "GROUND STATIONS (id | contact minutes per day in a sun-synchronous orbit | rent $M)");
  for (const g of allStations.filter(
    (x) => (mission.destination === "lunar-orbit") === (stationKind(x) === "deep-space"),
  )) {
    lines.push(`${g.id} | ${g.contactMinutesPerDay["sun-synchronous"] ?? 0} | ${(g.costUsd / 1e6).toFixed(2)}`);
  }
  lines.push(
    "",
    `ORBITS: types ${orbitTypes.map((o) => o.id).join(", ")}; altitudes 400–700 km (only with a launcher that has no fixed orbit).`,
  );
  return lines.join("\n");
}

// ---------- Agent 1 built-in: a small local search over part swaps ----------

export interface DesignStep {
  attempt: number;
  source: "claude" | "autopilot";
  /** What the agent changed and why. */
  note: string;
  ids: DesignIds;
  failures: AutopilotCheck[];
  pass: boolean;
  totalCostUsd: number;
}

interface Move {
  category: string;
  label: string;
  apply: (d: Design) => Design;
}

function setPart(d: Design, s: Subsystem, partId: string): Design {
  const p = allParts.find((x) => x.id === partId)!;
  const parts = { ...d.parts, [s]: p };
  let instruments = d.instruments;
  if (s === "structure") {
    const size = p.fits[0]!;
    for (const [k, v] of Object.entries(parts))
      if (k !== "structure" && v && !v.fits.includes(size)) delete parts[k as Subsystem];
    instruments = instruments?.filter((i) => i.fits.includes(size));
  }
  return { ...d, parts, instruments };
}

function movesFor(d: Design, mission: Mission): Move[] {
  const size = d.parts.structure?.fits[0];
  const moves: Move[] = [];
  for (const s of SUBSYSTEMS) {
    for (const p of allParts) {
      if (p.subsystem !== s || p.id === d.parts[s]?.id) continue;
      if (s !== "structure" && size && !p.fits.includes(size)) continue;
      moves.push({
        category: s,
        label: `${s}: ${d.parts[s]?.name ?? "none"} → ${p.name}`,
        apply: (x) => setPart(x, s, p.id),
      });
    }
  }
  for (const i of allInstruments) {
    if (size && !i.fits.includes(size)) continue;
    const has = (d.instruments ?? []).some((x) => x.id === i.id);
    moves.push({
      category: `instrument:${i.id}`,
      label: has ? `remove ${i.name}` : `add ${i.name}`,
      apply: (x) => ({
        ...x,
        instruments: has ? (x.instruments ?? []).filter((y) => y.id !== i.id) : [...(x.instruments ?? []), i],
      }),
    });
  }
  for (const l of launchersFor(mission.destination)) {
    if (String(l.id) === String(d.launcher?.id)) continue;
    moves.push({
      category: "launcher",
      label: `launcher: ${d.launcher?.name ?? "none"} → ${l.name}`,
      apply: (x) => ({
        ...x,
        launcher: l,
        orbit: l.fixedOrbit ? undefined : (x.orbit ?? { type: "sun-synchronous", altitudeKm: 525 }),
      }),
    });
  }
  if (d.launcher && !d.launcher.fixedOrbit && mission.destination === "earth-orbit") {
    for (const o of orbitTypes) {
      for (const altitudeKm of [450, 500, 525, 550, 600]) {
        if (d.orbit?.type === o.id && d.orbit.altitudeKm === altitudeKm) continue;
        moves.push({
          category: "orbit",
          label: `orbit → ${altitudeKm} km ${o.id}`,
          apply: (x) => ({ ...x, orbit: { type: o.id, altitudeKm } }),
        });
      }
    }
  }
  const stations = allStations.filter(
    (x) => (mission.destination === "lunar-orbit") === (stationKind(x) === "deep-space"),
  );
  const sets = [...stations.map((g) => [g]), ...stations.flatMap((g, i) => stations.slice(i + 1).map((h) => [g, h]))];
  const current = (d.groundStations ?? [])
    .map((g) => g.id)
    .sort()
    .join("+");
  for (const set of sets) {
    if (
      set
        .map((g) => g.id)
        .sort()
        .join("+") === current
    )
      continue;
    moves.push({
      category: "stations",
      label: `ground stations → ${set.map((g) => g.name).join(" + ")}`,
      apply: (x) => ({ ...x, groundStations: set }),
    });
  }
  return moves;
}

const scoreOf = (e: Evaluation) => e.failures.length * 1e9 + (e.budget.deadline.met ? 0 : 5e7) + e.budget.totalCostUsd;

/**
 * Agent 1 without Claude: start from a design and repair it, one or two changes per attempt,
 * always picking the change that fixes the most failing checks at the lowest cost.
 */
export function autoDesign(
  start: Design,
  mission: Mission,
  opts: { firstAttempt?: number; maxAttempts?: number; scenario?: AutopilotScenario; startNote?: string } = {},
): DesignStep[] {
  const s = opts.scenario ?? AUTOPILOT_SCENARIO;
  const steps: DesignStep[] = [];
  let design = start;
  let ev = evaluateDesign(design, mission, s);
  let attempt = opts.firstAttempt ?? 1;
  const push = (note: string) =>
    steps.push({
      attempt: attempt++,
      source: "autopilot",
      note,
      ids: toDesignIds(design),
      failures: ev.failures,
      pass: ev.pass,
      totalCostUsd: ev.budget.totalCostUsd,
    });
  push(opts.startNote ?? "Started from a proven 12U CubeSat template for wildfire detection.");
  const maxAttempts = opts.maxAttempts ?? 6;

  while (!ev.pass && steps.length < maxAttempts) {
    const moves = movesFor(design, mission);
    let best: { design: Design; ev: Evaluation; labels: string[] } | null = null;
    const consider = (d: Design, labels: string[]) => {
      const e = evaluateDesign(d, mission, s);
      if (!best || scoreOf(e) < scoreOf(best.ev)) best = { design: d, ev: e, labels };
    };
    const singles = moves.map((m) => {
      const d = m.apply(design);
      return { m, d, e: evaluateDesign(d, mission, s) };
    });
    for (const x of singles)
      if (!best || scoreOf(x.e) < scoreOf(best.ev)) best = { design: x.d, ev: x.e, labels: [x.m.label] };
    const bestSingle = best as { ev: Evaluation } | null;
    if (!bestSingle || bestSingle.ev.failures.length >= ev.failures.length) {
      // No single change fixes a check: try pairs of changes in different categories.
      for (let i = 0; i < moves.length; i++) {
        const di = singles[i]!.d;
        for (let j = i + 1; j < moves.length; j++) {
          if (moves[i]!.category === moves[j]!.category) continue;
          consider(moves[j]!.apply(di), [moves[i]!.label, moves[j]!.label]);
        }
      }
    }
    const chosen = best as { design: Design; ev: Evaluation; labels: string[] } | null;
    if (!chosen || scoreOf(chosen.ev) >= scoreOf(ev)) break;
    const fixed = ev.failures.filter((f) => !chosen.ev.failures.some((g) => g.id === f.id)).map((f) => f.id);
    design = chosen.design;
    ev = chosen.ev;
    push(
      `Changed ${chosen.labels.join(" and ")}${fixed.length ? ` to fix ${fixed.join(", ")}` : " to lower the cost"}.`,
    );
  }
  return steps;
}

/** The design Agent 1 starts from when Claude is not used: the Wildfire Watch CubeSat template. */
export function templateDesign(): Design {
  const pick = (id: string) => allParts.find((p) => p.id === id)!;
  return {
    parts: {
      structure: pick("structure-12u-frame"),
      solar: pick("solar-12u-deployable"),
      battery: pick("battery-90wh"),
      obc: pick("obc-microcontroller"),
      adcs: pick("adcs-integrated-cubesat"),
      propulsion: pick("propulsion-none"),
      comms: pick("comms-xband-cubesat"),
    },
    instruments: allInstruments.filter((i) => ["swir-fire-cubesat", "vis-wide-cubesat"].includes(i.id)),
    launcher: allLaunchers.find((l) => l.id === "rideshare"),
  };
}

// ---------- Agent 2: telemetry, recovery options and outcome ----------

export interface TelemetryFrame {
  /** Seconds after lift-off. */
  tS: number;
  label: string;
  altitudeKm: number;
  expectedAltitudeKm: number;
  speedKmS: number;
  powerW: number;
  batteryPct: number;
  propellantPct: number;
  /** Set on frames where the altitude error is over the detection threshold. */
  alert?: string;
}

/** The launch as the monitor sees it: nominal ascent, then a release below the planned orbit. */
export function launchTelemetry(
  design: Design,
  mission: Mission,
  s: AutopilotScenario = AUTOPILOT_SCENARIO,
): TelemetryFrame[] {
  const b = computeBudget(design, mission);
  const planned = b.orbit.altitudeKm;
  const actual = planned - s.anomaly.shortfallKm;
  const solar = b.powerProducedW;
  const frames: TelemetryFrame[] = [];
  const ascent: [number, string, number, number][] = [
    [0, "Lift-off", 0, 0],
    [60, "Max-Q passed", 0.06, 0.5],
    [150, "Stage 1 separation", 0.18, 2.3],
    [300, "Stage 2 burn", 0.45, 4.6],
    [480, "Stage 2 burn", 0.7, 6.6],
    [560, "Stage 2 cut-off, 9 s early", 0.8, 7.1],
  ];
  for (const [tS, label, f, v] of ascent) {
    const expected = Math.round(planned * f);
    const altitude = Math.round((tS >= 560 ? actual : planned) * f);
    frames.push({
      tS,
      label,
      altitudeKm: altitude,
      expectedAltitudeKm: expected,
      speedKmS: v,
      powerW: 0,
      batteryPct: 100,
      propellantPct: 100,
    });
  }
  const orbitFrames: [number, string, number][] = [
    [900, "Spacecraft released", 0],
    [1500, "Solar panels deployed", 0.3],
    [2400, "First orbit check", 0.6],
    [3300, "Orbit determined", 1],
  ];
  for (const [tS, label, sun] of orbitFrames) {
    frames.push({
      tS,
      label,
      altitudeKm: actual,
      expectedAltitudeKm: planned,
      speedKmS: Number(orbitalSpeedKmS(actual).toFixed(3)),
      powerW: Math.round(solar * sun),
      batteryPct: Math.round(100 - 20 * (1 - sun)),
      propellantPct: 100,
    });
  }
  for (const f of frames) {
    const err = f.expectedAltitudeKm - f.altitudeKm;
    if (err > s.detectThresholdKm)
      f.alert = `Altitude ${f.altitudeKm} km is ${err} km below the planned ${f.expectedAltitudeKm} km.`;
  }
  return frames;
}

export type RecoveryOptionId = "raise-full" | "raise-min" | "do-nothing";

export interface RecoveryOption {
  id: RecoveryOptionId;
  label: string;
  finalAltitudeKm: number;
  deltaVMs: number;
  propellantUsePct: number;
  /** Lifetime after the option, years (climbs keep the propellant left for drag make-up; "do-nothing" never fires). */
  lifetimeYears: number;
  meetsLifetime: boolean;
  feasible: boolean;
}

export interface Situation {
  plannedAltitudeKm: number;
  actualAltitudeKm: number;
  availableDeltaVMs: number;
  /** Lifetime if the thruster is never fired, years. */
  lifetimeIfNothingYears: number;
  minLifetimeYears: number;
  options: RecoveryOption[];
}

/** The facts and options the monitor decides on. */
export function situationFor(design: Design, mission: Mission, s: AutopilotScenario = AUTOPILOT_SCENARIO): Situation {
  const b = computeBudget(design, mission);
  const planned = b.orbit.altitudeKm;
  const actual = planned - s.anomaly.shortfallKm;
  const impulse = design.parts.propulsion?.performance.value ?? 0;
  const mass = b.massKg;
  const available = mass > 0 ? impulse / mass : 0;
  const minYears = mission.thresholds.minLifetimeYears;
  const option = (id: RecoveryOptionId, label: string, finalKm: number): RecoveryOption => {
    const fire = id !== "do-nothing";
    const dv = fire && finalKm > actual ? hohmannDeltaVMs(actual, finalKm) : 0;
    const left = fire ? Math.max(0, impulse - dv * mass) : 0;
    const life = missionLifetime(finalKm, { totalImpulseNs: left, massKg: mass }, LIFETIME_TABLE).years;
    return {
      id,
      label,
      finalAltitudeKm: finalKm,
      deltaVMs: dv,
      propellantUsePct: available > 0 ? Math.min(999, (dv / available) * 100) : dv > 0 ? Infinity : 0,
      lifetimeYears: life,
      meetsLifetime: life >= minYears,
      feasible: dv <= available,
    };
  };
  // Lowest altitude (5 km steps) that would stay up 1.5 x the required lifetime even if the thruster later failed.
  let minKm = planned;
  for (let km = actual + 5; km <= planned; km += 5) {
    if (decayLifetimeYears(km, LIFETIME_TABLE) >= minYears * 1.5) {
      minKm = km;
      break;
    }
  }
  const nothing = decayLifetimeYears(actual, LIFETIME_TABLE);
  return {
    plannedAltitudeKm: planned,
    actualAltitudeKm: actual,
    availableDeltaVMs: available,
    lifetimeIfNothingYears: nothing,
    minLifetimeYears: minYears,
    options: [
      option("raise-full", `Raise the orbit back to the planned ${planned} km`, planned),
      option("raise-min", `Raise the orbit only to ${minKm} km (saves propellant)`, minKm),
      option("do-nothing", `Do nothing and stay at ${actual} km`, actual),
    ],
  };
}

/** Agent 2 without Claude: restore the planned orbit if possible, else the cheapest climb that meets the lifetime. */
export function chooseRecovery(sit: Situation): { optionId: RecoveryOptionId; reasoning: string } {
  const full = sit.options.find((o) => o.id === "raise-full")!;
  const min = sit.options.find((o) => o.id === "raise-min")!;
  if (full.feasible && full.meetsLifetime)
    return {
      optionId: "raise-full",
      reasoning: `The planned ${full.finalAltitudeKm} km orbit is what the coverage (R1) and ground contacts were designed for, and the thruster can reach it with ${full.propellantUsePct.toFixed(0)}% of its propellant while still meeting the ${sit.minLifetimeYears}-year lifetime.`,
    };
  if (min.feasible && min.meetsLifetime)
    return {
      optionId: "raise-min",
      reasoning: `There is not enough propellant to reach the planned orbit, but climbing to ${min.finalAltitudeKm} km meets the ${sit.minLifetimeYears}-year lifetime.`,
    };
  return {
    optionId: "do-nothing",
    reasoning:
      "The thruster cannot climb out of the low orbit, so there is nothing to fire: the spacecraft will re-enter early.",
  };
}

export interface RecoveryOutcome {
  option: RecoveryOption;
  burn: TelemetryFrame[];
  /** R4 after the fix. */
  lifetimeMet: boolean;
  summary: string;
}

/** Applies the chosen option: the burn as telemetry, and whether the mission is saved. */
export function applyRecovery(
  design: Design,
  mission: Mission,
  optionId: RecoveryOptionId,
  s: AutopilotScenario = AUTOPILOT_SCENARIO,
): RecoveryOutcome {
  const sit = situationFor(design, mission, s);
  const option =
    sit.options.find((o) => o.id === optionId && o.feasible) ?? sit.options.find((o) => o.id === "do-nothing")!;
  const b = computeBudget(design, mission);
  const burn: TelemetryFrame[] = [];
  const steps = 6;
  const start = 3300;
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    const alt = Math.round(sit.actualAltitudeKm + (option.finalAltitudeKm - sit.actualAltitudeKm) * f);
    burn.push({
      tS: start + 600 * (i + 1),
      label:
        i === 0
          ? "Burn 1 start"
          : i === steps
            ? "Burn 2 complete"
            : i === Math.floor(steps / 2)
              ? "Coasting to new orbit"
              : "Climbing",
      altitudeKm: alt,
      expectedAltitudeKm: option.finalAltitudeKm,
      speedKmS: Number(orbitalSpeedKmS(alt).toFixed(3)),
      powerW: b.powerProducedW,
      batteryPct: 95,
      propellantPct: Math.max(0, Math.round(100 - option.propellantUsePct * f)),
    });
  }
  const yrs = option.lifetimeYears;
  const lifetimeMet = yrs >= sit.minLifetimeYears;
  const summary = lifetimeMet
    ? `The spacecraft is now at ${option.finalAltitudeKm} km with an expected lifetime of ${yrs >= 50 ? "50+" : yrs.toFixed(1)} years. R4 (at least ${sit.minLifetimeYears} year) is met and the mission continues.`
    : `The spacecraft stays at ${option.finalAltitudeKm} km and will re-enter after about ${yrs.toFixed(1)} years. R4 (at least ${sit.minLifetimeYears} year) is not met.`;
  return { option, burn, lifetimeMet, summary };
}

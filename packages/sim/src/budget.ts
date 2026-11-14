import {
  altitudeOptions,
  groundStations as allGroundStations,
  orbitTypes,
  wildfireWatch,
  type GroundStation,
  type Instrument,
  type Launcher,
  type MissionCard,
  type OrbitTypeId,
  type Part,
  type SpacecraftSize,
  type Subsystem,
} from "@space-mission/data";
import {
  downlinkCapacityGbPerDay,
  imagingSecondsPerDay,
  missionLifetime,
  orbitPower,
  revisitsPerDay,
  ssoInclinationDeg,
  type LifetimeTable,
  type OrbitPower,
  type Target,
} from "./earth-orbit.ts";
import { swathWidthKm } from "./orbit.ts";

/** The roles that share the mission budget. */
export type BudgetRole = "launch" | "spacecraft" | "science" | "ground";

/** Thresholds of the requirements the sim checks (from the mission card). */
export interface Thresholds {
  /** R1: views of the target region per day. */
  minRevisitsPerDay: number;
  /** R3: GB downlinked per day. */
  minDownlinkGbPerDay: number;
  /** R4: years in orbit. */
  minLifetimeYears: number;
}

/** The mission as the sim uses it: every number comes from the mission card in @space-mission/data. */
export interface Mission {
  id: string;
  name: string;
  objective: string;
  budgetUsd: number;
  /** Share of the budget for each role, in percent (sums to 100). */
  allocationsPct: Record<BudgetRole, number>;
  deadlineMonths: number;
  /** Months of waiting when the deadline is missed (a penalty, not a failure). */
  lateWaitMonths: number;
  teamCostPerMonthUsd: number;
  baseDevMonths: Partial<Record<SpacecraftSize, number>>;
  target: Target & { name: string; lonDeg: number };
  thresholds: Thresholds;
  /** Plain-English reason per requirement id (R1–R4) when it is not met. */
  failText: Record<string, string>;
  /** The source card. */
  card: MissionCard;
}

function minThreshold(card: MissionCard, metric: string, fallback: number): number {
  for (const r of card.requirements) if (r.check.kind === "min" && r.check.metric === metric) return r.check.value;
  return fallback;
}

/** Turns a mission card into the sim's Mission. */
export function missionFromCard(card: MissionCard): Mission {
  return {
    id: card.id,
    name: card.name,
    objective: card.objective,
    budgetUsd: card.constraints.budgetUsd,
    allocationsPct: { ...card.allocationsPct },
    deadlineMonths: card.deadlineMonths,
    lateWaitMonths: card.lateWaitMonths,
    teamCostPerMonthUsd: card.teamCostPerMonthUsd,
    baseDevMonths: { ...card.baseDevMonths },
    target: {
      name: card.targetRegion.name,
      latitudeDeg: card.targetRegion.latDeg,
      lonDeg: card.targetRegion.lonDeg,
      widthKm: card.targetRegion.widthKm,
    },
    thresholds: {
      minRevisitsPerDay: minThreshold(card, "revisitsPerDay", 1),
      minDownlinkGbPerDay: minThreshold(card, "downlinkGbPerDay", 1),
      minLifetimeYears: minThreshold(card, "lifetimeYears", 1),
    },
    failText: Object.fromEntries(card.requirements.map((r) => [r.id, r.failText])),
    card,
  };
}

/** Wildfire Watch, from the mission card in @space-mission/data. */
export const WILDFIRE_WATCH: Mission = missionFromCard(wildfireWatch);

/** The orbit the design asks for. A rideshare's fixed orbit overrides it. */
export interface OrbitChoice {
  type: OrbitTypeId;
  altitudeKm: number;
}

/** A design: one part per subsystem (missing subsystems are allowed while building), instruments, a launcher, orbit and ground stations. */
export interface Design {
  parts: Partial<Record<Subsystem, Part>>;
  launcher?: Launcher;
  instruments?: Instrument[];
  /** Default: the launcher's fixed orbit, else DEFAULT_ORBIT. */
  orbit?: OrbitChoice;
  /** Default: one station, the cheapest (DEFAULT_GROUND_STATIONS). */
  groundStations?: GroundStation[];
}

export const BUDGET_ROLES: readonly BudgetRole[] = ["launch", "spacecraft", "science", "ground"];
export const SUBSYSTEMS: readonly Subsystem[] = ["structure", "solar", "battery", "obc", "adcs", "propulsion", "comms"];
/** @deprecated Use mission.teamCostPerMonthUsd. */
export const TEAM_COST_PER_MONTH_USD = WILDFIRE_WATCH.teamCostPerMonthUsd;
/** @deprecated Use mission.baseDevMonths. */
export const BASE_DEV_MONTHS: Record<SpacecraftSize, number> = {
  "6U": 15,
  "12U": 15,
  smallsat: 24,
  ...WILDFIRE_WATCH.baseDevMonths,
};
export const DEFAULT_ORBIT: OrbitChoice = { type: "sun-synchronous", altitudeKm: 525 };
export const DEFAULT_GROUND_STATIONS: readonly GroundStation[] = [
  [...allGroundStations].sort((a, b) => a.costUsd - b.costUsd)[0]!,
];
/** Lifetime by altitude without propulsion, from orbits.json. */
export const LIFETIME_TABLE: LifetimeTable = altitudeOptions.map((a) => ({
  altitudeKm: a.altitudeKm,
  years: a.lifetimeYearsNoPropulsion,
}));

/** Extra development months for a part's TRL; null means the part is locked (too immature to fly). */
export function trlPenaltyMonths(trl: number): number | null {
  if (trl <= 4) return null;
  if (trl <= 6) return 9;
  if (trl <= 8) return 3;
  return 0;
}

/** Launch price for a spacecraft of the given mass. Rideshare: fixed price up to includedKg, then per kg. */
export function launchCostUsd(launcher: Launcher, massKg: number): number {
  if (launcher.costPerKgUsd !== undefined && launcher.includedKg !== undefined) {
    return launcher.launchCostUsd + Math.max(0, massKg - launcher.includedKg) * launcher.costPerKgUsd;
  }
  return launcher.launchCostUsd;
}

/** Maximum spacecraft mass a structure allows (its performance value, in kg). */
export function structureMaxMassKg(structure: Part): number {
  return structure.performance.value;
}

/** Inclination of an orbit type at an altitude: sun-synchronous is computed, the others come from orbits.json. */
export function orbitInclinationDeg(type: OrbitTypeId, altitudeKm: number): number {
  const fixed = orbitTypes.find((o) => o.id === type)?.inclinationDeg;
  return fixed ?? ssoInclinationDeg(altitudeKm);
}

/** A launcher's capacity to an orbit type: sun-synchronous and polar use the SSO capacity, inclined the LEO capacity. */
export function launcherCapacityKg(launcher: Launcher, type: OrbitTypeId): number {
  return type === "inclined" ? launcher.leoCapacityKg : launcher.ssoCapacityKg;
}

export interface ResolvedOrbit extends OrbitChoice {
  inclinationDeg: number;
  /** True when the launcher's fixed orbit decided it. */
  fixedByLauncher: boolean;
}

/** The orbit a design flies to: the launcher's fixed orbit, else the chosen orbit, else DEFAULT_ORBIT. */
export function resolveOrbit(design: Design): ResolvedOrbit {
  const fixed = design.launcher?.fixedOrbit;
  const fixedType = fixed && orbitTypes.some((o) => o.id === fixed.type) ? (fixed.type as OrbitTypeId) : undefined;
  const choice: OrbitChoice =
    fixed && fixedType ? { type: fixedType, altitudeKm: fixed.altitudeKm } : (design.orbit ?? DEFAULT_ORBIT);
  return { ...choice, inclinationDeg: orbitInclinationDeg(choice.type, choice.altitudeKm), fixedByLauncher: !!fixed };
}

export type CheckId =
  | "incomplete"
  | "locked"
  | "mass-structure"
  | "mass-launcher"
  | "instrument-fit"
  | "launcher-orbit"
  | "power"
  | "power-orbit"
  | "budget"
  | "schedule"
  | "R1"
  | "R2"
  | "R3"
  | "R4";

export interface Check {
  id: CheckId;
  ok: boolean;
  message: string;
  /** false: a failed check is a penalty, not a failure (the deadline). */
  blocking: boolean;
}

export interface Deadline {
  met: boolean;
  /** Months waited for the next opportunity (0 when met), charged at team cost. */
  waitMonths: number;
  /** Development plus waiting, months. */
  readyMonths: number;
  /** The schedule score is zero when the deadline is missed. */
  scheduleScoreZero: boolean;
}

export interface Budget {
  massKg: number;
  maxMassKg: number | null;
  /** Capacity of the launcher to the design's orbit type. */
  launcherCapacityKg: number | null;
  /** Peak draw: all parts and instruments on. */
  powerDrawnW: number;
  /** Peak solar output. */
  powerProducedW: number;
  costByRole: Record<BudgetRole, number>;
  allocationByRole: Record<BudgetRole, number>;
  /** Team cost over development and any deadline wait. */
  teamCostUsd: number;
  /** The team cost split over the roles in proportion to their budget allocations. */
  teamCostByRole: Record<BudgetRole, number>;
  /** What each role spends: its parts (costByRole) plus its share of the team cost. */
  spendByRole: Record<BudgetRole, number>;
  /** Sum of the TRL penalties of all chosen parts and instruments, months. */
  trlPenaltyMonths: number;
  totalCostUsd: number;
  devMonths: number;
  deadline: Deadline;
  orbit: ResolvedOrbit;
  groundStations: readonly GroundStation[];
  /** Widest instrument swath, km (0 without instruments). */
  swathKm: number;
  revisitsPerDay: number;
  contactMinutesPerDay: number;
  /** Data the radio and stations can send per day, GB (R3). */
  downlinkCapacityGbPerDay: number;
  /** Data the instruments produce per day over the target, GB. */
  dataProducedGbPerDay: number;
  lifetimeYears: number;
  orbitPower: OrbitPower;
  checks: Check[];
  /** All blocking checks pass (a missed deadline does not block). */
  pass: boolean;
}

export const formatUsd = (usd: number): string => `$${(usd / 1e6).toFixed(2)}M`;
const fmt = (n: number, d = 1) => n.toFixed(d);

export function computeBudget(design: Design, mission: Mission): Budget {
  const parts = Object.values(design.parts).filter((p): p is Part => p !== undefined);
  const instruments = design.instruments ?? [];
  const stations = design.groundStations ?? DEFAULT_GROUND_STATIONS;
  const orbit = resolveOrbit(design);
  const t = mission.thresholds;

  // Mass, power, cost (T13.1: instruments included, their cost goes to Science).
  const massKg = parts.reduce((s, p) => s + p.massKg, 0) + instruments.reduce((s, i) => s + i.massKg, 0);
  const partsPowerW = parts.reduce((s, p) => s + p.powerW, 0);
  const instrumentPowerW = instruments.reduce((s, i) => s + i.powerW, 0);
  const powerDrawnW = partsPowerW + instrumentPowerW;
  const powerProducedW = parts.reduce((s, p) => s + (p.powerProducedW ?? 0), 0);

  const costByRole: Record<BudgetRole, number> = { launch: 0, spacecraft: 0, science: 0, ground: 0 };
  for (const p of parts) costByRole[p.role] += p.costUsd;
  for (const i of instruments) costByRole.science += i.costUsd;
  for (const g of stations) costByRole.ground += g.costUsd;
  if (design.launcher) costByRole.launch = launchCostUsd(design.launcher, massKg);

  // Development time and the deadline (T13.4).
  const structure = design.parts.structure;
  const size = structure?.fits[0];
  const rated = [...parts, ...instruments];
  const locked = rated.filter((p) => trlPenaltyMonths(p.trl) === null);
  const penaltyMonths = rated.reduce((s, p) => s + (trlPenaltyMonths(p.trl) ?? 0), 0);
  const devMonths = (size ? (mission.baseDevMonths[size] ?? 0) : 0) + penaltyMonths;
  const lateBy = Math.max(0, devMonths - mission.deadlineMonths);
  const waitMonths =
    lateBy > 0 && mission.lateWaitMonths > 0 ? Math.ceil(lateBy / mission.lateWaitMonths) * mission.lateWaitMonths : 0;
  const deadline: Deadline = {
    met: lateBy === 0,
    waitMonths,
    readyMonths: devMonths + waitMonths,
    scheduleScoreZero: lateBy > 0,
  };
  const teamCostUsd = deadline.readyMonths * mission.teamCostPerMonthUsd;
  const totalCostUsd = Object.values(costByRole).reduce((s, c) => s + c, 0) + teamCostUsd;

  const pct = mission.allocationsPct;
  const pctSum = BUDGET_ROLES.reduce((s, r) => s + pct[r], 0);
  const teamCostByRole = {} as Record<BudgetRole, number>;
  const spendByRole = {} as Record<BudgetRole, number>;
  const allocationByRole = {} as Record<BudgetRole, number>;
  for (const r of BUDGET_ROLES) {
    teamCostByRole[r] = pctSum > 0 ? (teamCostUsd * pct[r]) / pctSum : 0;
    spendByRole[r] = costByRole[r] + teamCostByRole[r];
    allocationByRole[r] = (mission.budgetUsd * pct[r]) / 100;
  }

  // Orbit model (T13.2).
  const alt = orbit.altitudeKm;
  const swathKm = Math.max(0, ...instruments.map((i) => swathWidthKm(i.fieldOfViewDeg, alt)));
  const revisits = swathKm > 0 ? revisitsPerDay(swathKm, alt, orbit.inclinationDeg, mission.target) : 0;
  const imagingS = imagingSecondsPerDay(revisits, alt, mission.target);
  const dataProducedGb = instruments.reduce((s, i) => s + (i.dataRateMbps * 1e6 * imagingS) / 8 / 1e9, 0);
  const contactMinutes = stations.reduce((s, g) => s + (g.contactMinutesPerDay[orbit.type] ?? 0), 0);
  const radioKbps = design.parts.comms?.performance.value ?? 0;
  const capacityGb = downlinkCapacityGbPerDay(radioKbps, contactMinutes);
  const prop = design.parts.propulsion;
  const lifetime = missionLifetime(
    alt,
    prop ? { totalImpulseNs: prop.performance.value, massKg } : undefined,
    LIFETIME_TABLE,
  );
  // Instruments only draw power while imaging; the rest of the spacecraft is always on.
  const averageDrawnW = partsPowerW + (instrumentPowerW * imagingS) / 86_400;
  const power = orbitPower({
    altitudeKm: alt,
    peakProducedW: powerProducedW,
    drawnW: averageDrawnW,
    batteryWh: design.parts.battery?.performance.value ?? 0,
  });

  // Launcher (T13.3).
  const maxMassKg = structure ? structureMaxMassKg(structure) : null;
  const capacityKg = design.launcher ? launcherCapacityKg(design.launcher, orbit.type) : null;
  const fixed = design.launcher?.fixedOrbit;
  const orbitClash =
    !!fixed && !!design.orbit && (design.orbit.type !== fixed.type || design.orbit.altitudeKm !== fixed.altitudeKm);

  const misfits = size ? instruments.filter((i) => !i.fits.includes(size)) : [];
  const missing: string[] = SUBSYSTEMS.filter((s) => !design.parts[s]);
  if (instruments.length === 0) missing.push("instrument");
  if (!design.launcher) missing.push("launcher");
  const powerOk = powerProducedW > 0 && powerProducedW >= powerDrawnW;
  const kg = fmt(massKg);
  const orbitName = `${alt} km ${orbitTypes.find((o) => o.id === orbit.type)?.name.toLowerCase() ?? orbit.type}`;
  const why = (id: string) => (mission.failText[id] ? ` ${mission.failText[id]}` : "");
  const daylight = instruments.some((i) => i.detects.includes("daylightFire"));

  const check = (id: CheckId, ok: boolean, message: string, blocking = true): Check => ({ id, ok, message, blocking });
  const checks: Check[] = [
    check(
      "incomplete",
      missing.length === 0,
      missing.length === 0
        ? "Every subsystem, an instrument and a launcher are chosen."
        : `Still missing: ${missing.join(", ")}.`,
    ),
    check(
      "locked",
      locked.length === 0,
      locked.length === 0
        ? "All parts are mature enough to fly (TRL 5 or higher)."
        : `Too immature to fly (TRL 4 or lower): ${locked.map((p) => p.name).join(", ")}.`,
    ),
    check(
      "mass-structure",
      maxMassKg !== null && massKg <= maxMassKg,
      maxMassKg === null
        ? "No structure chosen, so the spacecraft has no mass limit yet."
        : `Spacecraft mass ${kg} kg ${massKg <= maxMassKg ? "fits within" : "is over"} the structure limit of ${maxMassKg} kg.`,
    ),
    check(
      "mass-launcher",
      capacityKg !== null && massKg <= capacityKg,
      capacityKg === null
        ? "No launcher chosen."
        : `Spacecraft mass ${kg} kg ${massKg <= capacityKg ? "fits within" : "is over"} the launcher's capacity of ${capacityKg} kg to a ${orbitName} orbit.`,
    ),
    check(
      "instrument-fit",
      misfits.length === 0,
      misfits.length === 0
        ? "Every instrument fits the spacecraft."
        : `Too big for a ${size} spacecraft: ${misfits.map((i) => i.name).join(", ")}. Choose a larger structure or a smaller instrument.`,
    ),
    check(
      "launcher-orbit",
      !orbitClash,
      orbitClash && fixed
        ? `The ${design.launcher?.name} only goes to a ${fixed.altitudeKm} km ${fixed.type} orbit. Choose that orbit or a dedicated launcher.`
        : `The spacecraft flies to a ${orbitName} orbit${orbit.fixedByLauncher ? " (fixed by the rideshare)" : ""}.`,
    ),
    check(
      "power",
      powerOk,
      `Solar panels produce ${powerProducedW} W and everything on at once draws ${fmt(powerDrawnW)} W${powerOk ? "." : ": not enough power."}`,
    ),
    check(
      "power-orbit",
      power.energyOk && power.batteryOk,
      !power.energyOk
        ? `Over an orbit the panels give ${fmt(power.averageProducedW)} W on average (${fmt(power.eclipseMinutes, 0)} minutes in shadow), less than the ${fmt(averageDrawnW)} W used. Add solar panels.`
        : !power.batteryOk
          ? `The battery needs at least ${fmt(power.requiredBatteryWh, 0)} Wh to get through ${fmt(power.eclipseMinutes, 0)} minutes of shadow. Choose a bigger battery.`
          : `Average power ${fmt(power.averageProducedW)} W covers ${fmt(averageDrawnW)} W, and the battery carries the ${fmt(power.eclipseMinutes, 0)}-minute eclipse.`,
    ),
    check(
      "budget",
      totalCostUsd <= mission.budgetUsd,
      `Total cost ${formatUsd(totalCostUsd)} ${totalCostUsd <= mission.budgetUsd ? "is within" : "is over"} the ${formatUsd(mission.budgetUsd)} budget.`,
    ),
    check(
      "schedule",
      deadline.met,
      deadline.met
        ? `Development takes ${devMonths} months and meets the ${mission.deadlineMonths}-month deadline.`
        : `Development takes ${devMonths} months and misses the ${mission.deadlineMonths}-month deadline: the team waits ${waitMonths} months for the next opportunity (${formatUsd(waitMonths * mission.teamCostPerMonthUsd)} of team cost) and the schedule score is zero.`,
      false,
    ),
    check(
      "R1",
      revisits >= t.minRevisitsPerDay,
      revisits >= t.minRevisitsPerDay
        ? `R1 met: the ${fmt(swathKm, 0)} km swath sees ${mission.target.name} ${fmt(revisits)} times per day.`
        : `R1 not met: ${swathKm > 0 ? `the ${fmt(swathKm, 0)} km swath sees ${mission.target.name} ${fmt(revisits, 2)} times per day` : "no instrument chosen"} (needs ${t.minRevisitsPerDay}).${why("R1")}`,
    ),
    check(
      "R2",
      daylight,
      daylight ? "R2 met: an instrument can detect active fires in daylight." : `R2 not met.${why("R2")}`,
    ),
    check(
      "R3",
      capacityGb >= t.minDownlinkGbPerDay,
      `R3 ${capacityGb >= t.minDownlinkGbPerDay ? "met" : "not met"}: ${fmt(capacityGb, 2)} GB/day can be downlinked in ${fmt(contactMinutes, 0)} minutes of contact with ${stations.length} ground station${stations.length === 1 ? "" : "s"} (needs ${t.minDownlinkGbPerDay} GB).${capacityGb >= t.minDownlinkGbPerDay ? "" : why("R3")}`,
    ),
    check(
      "R4",
      lifetime.years >= t.minLifetimeYears,
      `R4 ${lifetime.years >= t.minLifetimeYears ? "met" : "not met"}: at ${alt} km the satellite stays up about ${fmt(lifetime.years)} years${lifetime.propulsionYears > 0 ? ` (${fmt(lifetime.propulsionYears)} of them thanks to propulsion)` : ""} (needs ${t.minLifetimeYears}).${lifetime.years >= t.minLifetimeYears ? "" : why("R4")}`,
    ),
  ];

  return {
    massKg,
    maxMassKg,
    launcherCapacityKg: capacityKg,
    powerDrawnW,
    powerProducedW,
    costByRole,
    allocationByRole,
    teamCostUsd,
    teamCostByRole,
    spendByRole,
    trlPenaltyMonths: penaltyMonths,
    totalCostUsd,
    devMonths,
    deadline,
    orbit,
    groundStations: stations,
    swathKm,
    revisitsPerDay: revisits,
    contactMinutesPerDay: contactMinutes,
    downlinkCapacityGbPerDay: capacityGb,
    dataProducedGbPerDay: dataProducedGb,
    lifetimeYears: lifetime.years,
    orbitPower: power,
    checks,
    pass: checks.every((c) => c.ok || !c.blocking),
  };
}

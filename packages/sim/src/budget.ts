import {
  altitudeOptions,
  groundStations as allGroundStations,
  missionCards,
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
import {
  DEFAULT_LUNAR_ALTITUDE_KM,
  LUNAR_ALTITUDE_RANGE_KM,
  daysToMapPoles,
  deltaVFromPropellantKmS,
  loiDeltaVKmS,
  lunarContactMinutesPerDay,
  lunarOccultationFraction,
  lunarOrbitPower,
  lunarOrbitalPeriodS,
  lunarOrbitsPerDay,
  lunarTransferFrom,
  polarCoveragePerDay,
  polarImagingFraction,
  propellantCapacityKg,
  propellantForDeltaVKg,
  stationKeepingKmSPerYear,
  type LunarTransfer,
} from "./lunar.ts";
import { swathWidthKm } from "./orbit.ts";

/** The roles that share the mission budget. */
export type BudgetRole = "launch" | "spacecraft" | "science" | "ground";

/** Where a mission flies (shared contract: `destination` on the mission card). */
export type Destination = "earth-orbit" | "lunar-orbit";

/** Thresholds of the requirements the sim checks (from the mission card). */
export interface Thresholds {
  /** R1: views of the target region per day. */
  minRevisitsPerDay: number;
  /** R3 / L3: GB downlinked per day. */
  minDownlinkGbPerDay: number;
  /** R4 / L4: years in orbit. */
  minLifetimeYears: number;
  /** L1: orbit inclination, degrees. */
  minInclinationDeg: number;
  /** L5: delta-v margin after insertion and station-keeping, km/s. */
  minDeltaVMarginKmS: number;
}

/** Something a mission card locks for its mission, with the reason shown to the player. */
export interface MissionLock {
  kind: "size" | "part";
  id: string;
  reason: string;
}

/** The mission as the sim uses it: every number comes from the mission card in @space-mission/data. */
export interface Mission {
  id: string;
  name: string;
  objective: string;
  destination: Destination;
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
  /** Plain-English reason per requirement id (R1–R4, L1–L5) when it is not met. */
  failText: Record<string, string>;
  /** Sizes and parts the card locks for this mission (e.g., 6U and propulsion "none" for the Moon). */
  locked: MissionLock[];
  /** Transfer numbers for a lunar mission (undefined in Earth orbit). */
  transfer?: LunarTransfer;
  /** Altitudes the player may pick for a lunar orbit, km. */
  lunarAltitudesKm?: number[];
  /** Key of this mission in an instrument's scienceValue (camelCase of the card id, e.g. "wildfireWatch"). */
  scienceKey: string;
  /** The source card. */
  card: MissionCard;
}

function minThreshold(card: MissionCard, metric: string, fallback: number): number {
  for (const r of card.requirements) {
    const c = r.check as { kind: string; metric?: string; value?: number };
    if (c.kind === "min" && c.metric === metric && typeof c.value === "number") return c.value;
  }
  return fallback;
}

const camel = (id: string) => id.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase());

const DEFAULT_LUNAR_LOCKS: MissionLock[] = [
  {
    kind: "size",
    id: "6U",
    reason:
      "A 6U CubeSat has no room for an ice-detecting instrument together with the propulsion and fuel needed to stop at the Moon.",
  },
  {
    kind: "part",
    id: "propulsion-none",
    reason: "Without propulsion the spacecraft flies past the Moon. It must fire a thruster to brake into lunar orbit.",
  },
];

/** Turns a mission card into the sim's Mission (both Wildfire Watch and Lunar Ice Hunter). */
export function missionFromCard(card: MissionCard): Mission {
  const raw = card as unknown as {
    destination?: unknown;
    transfer?: { altitudesKm?: unknown } | undefined;
    locked?: unknown;
  };
  const lunar = raw.destination === "lunar-orbit";
  const locked: MissionLock[] = Array.isArray(raw.locked)
    ? raw.locked
        .filter(
          (l): l is MissionLock =>
            !!l && (l.kind === "size" || l.kind === "part") && typeof l.id === "string" && typeof l.reason === "string",
        )
        .map((l) => ({ kind: l.kind, id: l.id, reason: l.reason }))
    : lunar
      ? DEFAULT_LUNAR_LOCKS
      : [];
  const altitudes = Array.isArray(raw.transfer?.altitudesKm)
    ? raw.transfer.altitudesKm.filter((a): a is number => typeof a === "number")
    : [50, 75, 100, 150, 200];
  return {
    id: card.id,
    name: card.name,
    objective: card.objective,
    destination: lunar ? "lunar-orbit" : "earth-orbit",
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
      minInclinationDeg: minThreshold(card, "inclinationDeg", 85),
      minDeltaVMarginKmS: minThreshold(card, "deltaVMarginKmS", 0),
    },
    failText: Object.fromEntries(card.requirements.map((r) => [r.id, r.failText])),
    locked,
    transfer: lunar ? lunarTransferFrom(raw.transfer) : undefined,
    lunarAltitudesKm: lunar ? altitudes : undefined,
    scienceKey: camel(card.id),
    card,
  };
}

/** Wildfire Watch, from the mission card in @space-mission/data. */
export const WILDFIRE_WATCH: Mission = missionFromCard(wildfireWatch);

const lunarCard = missionCards.find((c) => c.id === "lunar-ice-hunter");
/** Lunar Ice Hunter (design.md section 10); undefined until its card is in @space-mission/data. */
export const LUNAR_ICE_HUNTER: Mission | undefined = lunarCard ? missionFromCard(lunarCard) : undefined;

/** Every playable mission, in card order (Wildfire Watch first). */
export const MISSIONS: readonly Mission[] = missionCards.map((c) =>
  c.id === WILDFIRE_WATCH.id
    ? WILDFIRE_WATCH
    : c.id === lunarCard?.id && LUNAR_ICE_HUNTER
      ? LUNAR_ICE_HUNTER
      : missionFromCard(c),
);

/** The mission with this id, or Wildfire Watch when it is unknown. */
export function missionById(id: string): Mission {
  return MISSIONS.find((m) => m.id === id) ?? WILDFIRE_WATCH;
}

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
  /** Default: the launcher's fixed orbit, else DEFAULT_ORBIT (DEFAULT_LUNAR_ORBIT at the Moon). */
  orbit?: OrbitChoice;
  /** Default: one station, the cheapest (DEFAULT_GROUND_STATIONS; the deep-space ones at the Moon). */
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
/** A 100 km polar orbit around the Moon. */
export const DEFAULT_LUNAR_ORBIT: OrbitChoice = { type: "polar", altitudeKm: DEFAULT_LUNAR_ALTITUDE_KM };

/** A ground station's kind (shared contract); stations without the field are near-Earth. */
export function stationKind(g: GroundStation): "near-earth" | "deep-space" {
  return (g as { kind?: unknown }).kind === "deep-space" ? "deep-space" : "near-earth";
}
export const DEFAULT_GROUND_STATIONS: readonly GroundStation[] = [
  [...allGroundStations].filter((g) => stationKind(g) === "near-earth").sort((a, b) => a.costUsd - b.costUsd)[0] ??
    [...allGroundStations].sort((a, b) => a.costUsd - b.costUsd)[0]!,
];
/** The cheapest deep-space station (falls back to the cheapest station of any kind). */
export const DEFAULT_DEEP_SPACE_STATIONS: readonly GroundStation[] = [
  [...allGroundStations].filter((g) => stationKind(g) === "deep-space").sort((a, b) => a.costUsd - b.costUsd)[0] ??
    DEFAULT_GROUND_STATIONS[0]!,
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

/** Inclination around the Moon: polar and sun-synchronous mean a 90° polar orbit; inclined keeps its tilt from orbits.json. */
export function lunarInclinationDeg(type: OrbitTypeId): number {
  if (type === "inclined") return orbitTypes.find((o) => o.id === type)?.inclinationDeg ?? 45;
  return 90;
}

/** A launcher's capacity to a trans-lunar trajectory: its own figure, else LEO capacity × the card's factor. */
export function tliCapacityKg(launcher: Launcher, transfer?: LunarTransfer): number {
  const own = (launcher as { tliCapacityKg?: unknown }).tliCapacityKg;
  if (typeof own === "number" && own > 0) return own;
  return launcher.leoCapacityKg * (transfer?.tliCapacityFactor ?? lunarTransferFrom(undefined).tliCapacityFactor);
}

/**
 * A launcher's capacity to an orbit type: sun-synchronous and polar use the SSO capacity, inclined the LEO capacity.
 * For a lunar mission it is the capacity to a trans-lunar trajectory.
 */
export function launcherCapacityKg(launcher: Launcher, type: OrbitTypeId, mission?: Mission): number {
  if (mission?.destination === "lunar-orbit") return tliCapacityKg(launcher, mission.transfer);
  return type === "inclined" ? launcher.leoCapacityKg : launcher.ssoCapacityKg;
}

export interface ResolvedOrbit extends OrbitChoice {
  inclinationDeg: number;
  /** True when the launcher's fixed orbit decided it. */
  fixedByLauncher: boolean;
}

/** The orbit a design flies to: the launcher's fixed orbit, else the chosen orbit, else the mission's default. */
export function resolveOrbit(design: Design, mission?: Mission): ResolvedOrbit {
  const lunar = mission?.destination === "lunar-orbit";
  const fixed = lunar ? undefined : design.launcher?.fixedOrbit;
  const fixedType = fixed && orbitTypes.some((o) => o.id === fixed.type) ? (fixed.type as OrbitTypeId) : undefined;
  const choice: OrbitChoice =
    fixed && fixedType
      ? { type: fixedType, altitudeKm: fixed.altitudeKm }
      : (design.orbit ?? (lunar ? DEFAULT_LUNAR_ORBIT : DEFAULT_ORBIT));
  if (lunar) {
    const altitudeKm = Math.min(LUNAR_ALTITUDE_RANGE_KM.max, Math.max(LUNAR_ALTITUDE_RANGE_KM.min, choice.altitudeKm));
    return { type: choice.type, altitudeKm, inclinationDeg: lunarInclinationDeg(choice.type), fixedByLauncher: false };
  }
  return { ...choice, inclinationDeg: orbitInclinationDeg(choice.type, choice.altitudeKm), fixedByLauncher: !!fixed };
}

export type CheckId =
  | "incomplete"
  | "locked"
  | "mission-lock"
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
  | "R4"
  | "L1"
  | "L2"
  | "L3"
  | "L4"
  | "L5";

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

/** Delta-v and propellant of a lunar design (design.md 10.2). */
export interface DeltaVBudget {
  /** Lunar orbit insertion at the chosen altitude, km/s. */
  loiKmS: number;
  /** Station-keeping at the chosen altitude, km/s per year. */
  stationKeepingKmSPerYear: number;
  /** Insertion plus station-keeping for the required lifetime, km/s. */
  neededKmS: number;
  /** What the thruster and its full tank give the dry spacecraft, km/s (0 without propulsion). */
  availableKmS: number;
  /** availableKmS − neededKmS (L5 needs it ≥ 0). */
  marginKmS: number;
  /** The thruster's specific impulse, s (0 without propulsion). */
  specificImpulseS: number;
  /** Spacecraft without propellant, kg. */
  dryMassKg: number;
  /** Propellant carried: the thruster's full tank (total impulse / (g0 × Isp)), kg. */
  propellantKg: number;
  /** Propellant needed for neededKmS, kg (Infinity without propulsion). */
  propellantNeededKg: number;
  /** Dry mass plus propellant, kg: what the launcher must carry. */
  wetMassKg: number;
}

/** The lunar orbit as flown (design.md 10.2). */
export interface LunarOrbit {
  periodMinutes: number;
  orbitsPerDay: number;
  /** Share of each orbit in the Moon's shadow (worst case). */
  eclipseFraction: number;
  /** Share of each orbit hidden from Earth behind the Moon (monthly average). */
  occultationFraction: number;
  /** Share of the polar caps (poleward of 80°) mapped per day. */
  polarCoveragePerDay: number;
  /** Days to map both polar caps once (Infinity when the orbit misses them). */
  daysToMapPoles: number;
  /** Multiplier on the radio's data rate at lunar distance. */
  lunarRateFactor: number;
  /** Minutes per day the deep-space stations see the Moon, before occultation. */
  stationWindowMinutesPerDay: number;
  /** Years of station-keeping the propellant left after insertion allows. */
  stationKeepingYears: number;
}

export interface Budget {
  /** Spacecraft mass as launched (at the Moon: dry mass plus propellant). */
  massKg: number;
  maxMassKg: number | null;
  /** Capacity of the launcher to the design's orbit type (at the Moon: to a trans-lunar trajectory). */
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
  /** Views of the target per day (at the Moon: passes over the target pole per day). */
  revisitsPerDay: number;
  contactMinutesPerDay: number;
  /** Data the radio and stations can send per day, GB (R3 / L3). */
  downlinkCapacityGbPerDay: number;
  /** Data the instruments produce per day over the target, GB. */
  dataProducedGbPerDay: number;
  lifetimeYears: number;
  orbitPower: OrbitPower;
  /** Delta-v and propellant (lunar missions only). */
  deltaV?: DeltaVBudget;
  /** The lunar orbit (lunar missions only). */
  lunar?: LunarOrbit;
  checks: Check[];
  /** All blocking checks pass (a missed deadline does not block). */
  pass: boolean;
}

export const formatUsd = (usd: number): string => `$${(usd / 1e6).toFixed(2)}M`;
const fmt = (n: number, d = 1) => n.toFixed(d);

/** Default data-rate reduction at lunar distance for radios without `lunarRateFactor` (an estimate). */
export const DEFAULT_LUNAR_RATE_FACTOR = 0.02;

/** A station's contact minutes per day for the mission's orbit (near-Earth stations see nothing at the Moon). */
export function stationContactMinutes(g: GroundStation, orbit: ResolvedOrbit, mission: Mission): number {
  if (mission.destination !== "lunar-orbit") return g.contactMinutesPerDay[orbit.type] ?? 0;
  if (stationKind(g) !== "deep-space") return 0;
  const own = (g as { lunarContactMinutesPerDay?: unknown }).lunarContactMinutesPerDay;
  const window = typeof own === "number" ? own : lunarContactMinutesPerDay([g.lonDeg], orbit.altitudeKm);
  return window * (typeof own === "number" ? 1 - lunarOccultationFraction(orbit.altitudeKm) : 1);
}

/** Years the propellant left after insertion keeps the orbit, capped at 10. */
function lunarStationKeepingYears(availableKmS: number, loiKmS: number, perYear: number): number {
  if (availableKmS <= loiKmS) return 0;
  return perYear > 0 ? Math.min(10, (availableKmS - loiKmS) / perYear) : 10;
}

export function computeBudget(design: Design, mission: Mission): Budget {
  const lunar = mission.destination === "lunar-orbit";
  const parts = Object.values(design.parts).filter((p): p is Part => p !== undefined);
  const instruments = design.instruments ?? [];
  const stations = design.groundStations ?? (lunar ? DEFAULT_DEEP_SPACE_STATIONS : DEFAULT_GROUND_STATIONS);
  const orbit = resolveOrbit(design, mission);
  const t = mission.thresholds;
  const alt = orbit.altitudeKm;

  // Mass, power, cost (T13.1: instruments included, their cost goes to Science).
  const dryMassKg = parts.reduce((s, p) => s + p.massKg, 0) + instruments.reduce((s, i) => s + i.massKg, 0);
  const partsPowerW = parts.reduce((s, p) => s + p.powerW, 0);
  const instrumentPowerW = instruments.reduce((s, i) => s + i.powerW, 0);
  const powerDrawnW = partsPowerW + instrumentPowerW;
  const powerProducedW = parts.reduce((s, p) => s + (p.powerProducedW ?? 0), 0);

  // Transfer and delta-v (T26.2): the rocket equation from the thruster's specific impulse and total impulse.
  const prop = design.parts.propulsion;
  let deltaV: DeltaVBudget | undefined;
  if (lunar) {
    const transfer = mission.transfer ?? lunarTransferFrom(undefined);
    const isp = (prop as { specificImpulseS?: unknown } | undefined)?.specificImpulseS;
    const ispS = typeof isp === "number" && isp > 0 ? isp : 0;
    const loi = loiDeltaVKmS(alt, transfer);
    const perYear = stationKeepingKmSPerYear(alt, transfer);
    const neededKmS = loi + perYear * t.minLifetimeYears;
    const propellantKg = prop ? propellantCapacityKg(prop.performance.value, ispS) : 0;
    const availableKmS = deltaVFromPropellantKmS(dryMassKg, propellantKg, ispS);
    deltaV = {
      loiKmS: loi,
      stationKeepingKmSPerYear: perYear,
      neededKmS,
      availableKmS,
      marginKmS: availableKmS - neededKmS,
      specificImpulseS: ispS,
      dryMassKg,
      propellantKg,
      propellantNeededKg: propellantForDeltaVKg(dryMassKg, neededKmS, ispS),
      wetMassKg: dryMassKg + propellantKg,
    };
  }
  const massKg = deltaV ? deltaV.wetMassKg : dryMassKg;

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
  const deadlineWaitMonths =
    lateBy > 0 && mission.lateWaitMonths > 0 ? Math.ceil(lateBy / mission.lateWaitMonths) * mission.lateWaitMonths : 0;
  // A fixed-date launcher (the lunar rideshare) flies once a year at its fixed month; being late waits for the next flight.
  const fixedMonth = design.launcher?.fixedLaunchMonth;
  const rideshareWaitMonths =
    fixedMonth !== undefined && devMonths > fixedMonth
      ? fixedMonth + Math.ceil((devMonths - fixedMonth) / 12) * 12 - devMonths
      : 0;
  const waitMonths = Math.max(deadlineWaitMonths, rideshareWaitMonths);
  const deadline: Deadline = {
    met: lateBy === 0 && rideshareWaitMonths === 0,
    waitMonths,
    readyMonths: devMonths + waitMonths,
    scheduleScoreZero: waitMonths > 0,
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

  // Orbit model (T13.2 for Earth, T26.3 for the Moon).
  const swathKm = Math.max(0, ...instruments.map((i) => swathWidthKm(i.fieldOfViewDeg, alt)));
  const radioKbps = design.parts.comms?.performance.value ?? 0;
  let revisits: number;
  let imagingS: number;
  let contactMinutes: number;
  let capacityGb: number;
  let lifetime: { years: number; propulsionYears: number };
  let power: OrbitPower;
  let lunarOrbit: LunarOrbit | undefined;
  if (lunar && deltaV) {
    const reachesPoles = polarImagingFraction(orbit.inclinationDeg) > 0;
    revisits = reachesPoles ? lunarOrbitsPerDay(alt) : 0;
    imagingS = swathKm > 0 ? 86_400 * polarImagingFraction(orbit.inclinationDeg) : 0;
    const windowMinutes = Math.min(
      1440,
      stations.reduce((s, g) => {
        if (stationKind(g) !== "deep-space") return s;
        const own = (g as { lunarContactMinutesPerDay?: unknown }).lunarContactMinutesPerDay;
        return s + (typeof own === "number" ? own : lunarContactMinutesPerDay([g.lonDeg], 0));
      }, 0),
    );
    contactMinutes = windowMinutes * (1 - lunarOccultationFraction(alt));
    const rf = (design.parts.comms as { lunarRateFactor?: unknown } | undefined)?.lunarRateFactor;
    const rateFactor = typeof rf === "number" && rf > 0 ? rf : DEFAULT_LUNAR_RATE_FACTOR;
    capacityGb = downlinkCapacityGbPerDay(radioKbps * rateFactor, contactMinutes);
    const skYears = lunarStationKeepingYears(deltaV.availableKmS, deltaV.loiKmS, deltaV.stationKeepingKmSPerYear);
    lifetime = { years: skYears, propulsionYears: skYears };
    const coverage = polarCoveragePerDay(swathKm, alt, orbit.inclinationDeg);
    lunarOrbit = {
      periodMinutes: lunarOrbitalPeriodS(alt) / 60,
      orbitsPerDay: lunarOrbitsPerDay(alt),
      eclipseFraction: 0,
      occultationFraction: lunarOccultationFraction(alt),
      polarCoveragePerDay: coverage,
      daysToMapPoles: daysToMapPoles(coverage),
      lunarRateFactor: rateFactor,
      stationWindowMinutesPerDay: windowMinutes,
      stationKeepingYears: skYears,
    };
    const averageDrawnW = partsPowerW + (instrumentPowerW * imagingS) / 86_400;
    power = lunarOrbitPower({
      altitudeKm: alt,
      peakProducedW: powerProducedW,
      drawnW: averageDrawnW,
      batteryWh: design.parts.battery?.performance.value ?? 0,
    });
    lunarOrbit.eclipseFraction = power.eclipseFraction;
  } else {
    revisits = swathKm > 0 ? revisitsPerDay(swathKm, alt, orbit.inclinationDeg, mission.target) : 0;
    imagingS = imagingSecondsPerDay(revisits, alt, mission.target);
    contactMinutes = stations.reduce((s, g) => s + (g.contactMinutesPerDay[orbit.type] ?? 0), 0);
    capacityGb = downlinkCapacityGbPerDay(radioKbps, contactMinutes);
    lifetime = missionLifetime(
      alt,
      prop ? { totalImpulseNs: prop.performance.value, massKg } : undefined,
      LIFETIME_TABLE,
    );
    // Instruments only draw power while imaging; the rest of the spacecraft is always on.
    const averageDrawnW = partsPowerW + (instrumentPowerW * imagingS) / 86_400;
    power = orbitPower({
      altitudeKm: alt,
      peakProducedW: powerProducedW,
      drawnW: averageDrawnW,
      batteryWh: design.parts.battery?.performance.value ?? 0,
    });
  }
  const averageDrawnW = partsPowerW + (instrumentPowerW * imagingS) / 86_400;
  const dataProducedGb = instruments.reduce((s, i) => s + (i.dataRateMbps * 1e6 * imagingS) / 8 / 1e9, 0);

  // Launcher (T13.3).
  const maxMassKg = structure ? structureMaxMassKg(structure) : null;
  const capacityKg = design.launcher ? launcherCapacityKg(design.launcher, orbit.type, mission) : null;
  const fixed = lunar ? undefined : design.launcher?.fixedOrbit;
  const orbitClash =
    !!fixed && !!design.orbit && (design.orbit.type !== fixed.type || design.orbit.altitudeKm !== fixed.altitudeKm);

  const misfits = size ? instruments.filter((i) => !i.fits.includes(size)) : [];
  const missing: string[] = SUBSYSTEMS.filter((s) => !design.parts[s]);
  if (instruments.length === 0) missing.push("instrument");
  if (!design.launcher) missing.push("launcher");
  const powerOk = powerProducedW > 0 && powerProducedW >= powerDrawnW;
  const kg = fmt(massKg);
  const orbitName = lunar
    ? `${alt} km ${orbit.inclinationDeg >= 85 ? "polar" : "inclined"} lunar`
    : `${alt} km ${orbitTypes.find((o) => o.id === orbit.type)?.name.toLowerCase() ?? orbit.type}`;
  const why = (id: string) => (mission.failText[id] ? ` ${mission.failText[id]}` : "");
  const detects = (d: string) => instruments.some((i) => (i.detects as readonly string[]).includes(d));
  const missionLocks = mission.locked.filter(
    (l) => (l.kind === "size" && size === l.id) || (l.kind === "part" && parts.some((p) => p.id === l.id)),
  );

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
  ];
  if (mission.locked.length > 0) {
    checks.push(
      check(
        "mission-lock",
        missionLocks.length === 0,
        missionLocks.length === 0
          ? `Nothing locked for ${mission.name} is in the design.`
          : missionLocks.map((l) => `${l.id} is locked for this mission: ${l.reason}`).join(" "),
      ),
    );
  }
  checks.push(
    check(
      "mass-structure",
      maxMassKg !== null && massKg <= maxMassKg,
      maxMassKg === null
        ? "No structure chosen, so the spacecraft has no mass limit yet."
        : `Spacecraft mass ${kg} kg${deltaV ? ` (${fmt(deltaV.dryMassKg)} kg dry plus ${fmt(deltaV.propellantKg)} kg of propellant)` : ""} ${massKg <= maxMassKg ? "fits within" : "is over"} the structure limit of ${maxMassKg} kg.`,
    ),
    check(
      "mass-launcher",
      capacityKg !== null && massKg <= capacityKg,
      capacityKg === null
        ? "No launcher chosen."
        : lunar
          ? `Spacecraft mass ${kg} kg (propellant included) ${massKg <= capacityKg ? "fits within" : "is over"} the launcher's capacity of ${fmt(capacityKg, 0)} kg towards the Moon.`
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
        : lunar
          ? `The launcher sends the spacecraft towards the Moon; its own thruster brakes it into a ${orbitName} orbit.`
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
        ? `Over an orbit the panels give ${fmt(power.averageProducedW)} W on average (${fmt(power.eclipseMinutes, 0)} minutes in ${lunar ? "the Moon's shadow" : "shadow"}), less than the ${fmt(averageDrawnW)} W used. Add solar panels.`
        : !power.batteryOk
          ? `The battery needs at least ${fmt(power.requiredBatteryWh, 0)} Wh to get through ${fmt(power.eclipseMinutes, 0)} minutes of ${lunar ? "the Moon's shadow" : "shadow"}. Choose a bigger battery.`
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
        : rideshareWaitMonths > deadlineWaitMonths
          ? `Development takes ${devMonths} months and misses the ${design.launcher?.name}'s fixed flight at month ${fixedMonth}: the team waits ${waitMonths} months for the next one (${formatUsd(waitMonths * mission.teamCostPerMonthUsd)} of team cost) and the schedule score is zero.`
          : `Development takes ${devMonths} months and misses the ${mission.deadlineMonths}-month deadline: the team waits ${waitMonths} months for the next opportunity (${formatUsd(waitMonths * mission.teamCostPerMonthUsd)} of team cost) and the schedule score is zero.`,
      false,
    ),
  );

  if (lunar && deltaV && lunarOrbit) {
    const l1 = orbit.inclinationDeg >= t.minInclinationDeg;
    const ice = detects("waterIce");
    const l3 = capacityGb >= t.minDownlinkGbPerDay;
    const l4 = lifetime.years >= t.minLifetimeYears;
    const l5 = prop !== undefined && deltaV.specificImpulseS > 0 && deltaV.marginKmS >= t.minDeltaVMarginKmS;
    const deepSpace = stations.filter((g) => stationKind(g) === "deep-space").length;
    checks.push(
      check(
        "L1",
        l1,
        l1
          ? `L1 met: a ${orbit.inclinationDeg}° orbit at ${alt} km passes over both poles ${fmt(lunarOrbit.orbitsPerDay)} times a day and maps the polar caps in about ${Number.isFinite(lunarOrbit.daysToMapPoles) ? `${lunarOrbit.daysToMapPoles} days` : "– (no instrument)"}.`
          : `L1 not met: a ${orbit.inclinationDeg}° orbit never reaches the poles (needs ${t.minInclinationDeg}° or more).${why("L1")}`,
      ),
      check(
        "L2",
        ice,
        ice
          ? `L2 met: ${instruments
              .filter((i) => (i.detects as readonly string[]).includes("waterIce"))
              .map((i) => i.name)
              .join(", ")} can detect water ice.`
          : `L2 not met.${why("L2")}`,
      ),
      check(
        "L3",
        l3,
        `L3 ${l3 ? "met" : "not met"}: ${fmt(capacityGb, 2)} GB/day reaches Earth in ${fmt(contactMinutes, 0)} minutes of contact with ${deepSpace} deep-space station${deepSpace === 1 ? "" : "s"} (the radio runs at ${Math.round(lunarOrbit.lunarRateFactor * 100)}% of its Earth-orbit rate at the Moon's distance; needs ${t.minDownlinkGbPerDay} GB).${l3 ? "" : why("L3")}`,
      ),
      check(
        "L4",
        l4,
        `L4 ${l4 ? "met" : "not met"}: after the insertion burn the propellant keeps a ${alt} km orbit for about ${fmt(lifetime.years)} years at ${fmt(deltaV.stationKeepingKmSPerYear * 1000, 0)} m/s per year (needs ${t.minLifetimeYears}).${l4 ? "" : why("L4")}`,
      ),
      check(
        "L5",
        l5,
        !prop || deltaV.specificImpulseS <= 0
          ? `L5 not met: no thruster with a specific impulse, so the spacecraft cannot brake into lunar orbit.${why("L5")}`
          : `L5 ${l5 ? "met" : "not met"}: ${fmt(deltaV.propellantKg)} kg of propellant at ${fmt(deltaV.specificImpulseS, 0)} s gives ${fmt(deltaV.availableKmS * 1000, 0)} m/s; insertion (${fmt(deltaV.loiKmS * 1000, 0)} m/s) plus ${t.minLifetimeYears} year${t.minLifetimeYears === 1 ? "" : "s"} of station-keeping needs ${fmt(deltaV.neededKmS * 1000, 0)} m/s (margin ${fmt(deltaV.marginKmS * 1000, 0)} m/s).${l5 ? "" : why("L5")}`,
      ),
    );
  } else {
    const daylight = detects("daylightFire");
    checks.push(
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
    );
  }

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
    ...(deltaV ? { deltaV } : {}),
    ...(lunarOrbit ? { lunar: lunarOrbit } : {}),
    checks,
    pass: checks.every((c) => c.ok || !c.blocking),
  };
}

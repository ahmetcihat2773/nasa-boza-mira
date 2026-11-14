/**
 * Earth-orbit model for Wildfire Watch (T12): simple, plausible formulas for circular orbits.
 * Builds on the geometry helpers in orbit.ts (period, swath, ground-station coverage angle).
 */
import { EARTH_RADIUS_KM, EARTH_MU_KM3_S2, coverageHalfAngleRad, orbitalPeriodS } from "./orbit.ts";

const RAD = Math.PI / 180;
const DAY_S = 86_400;

/** Earth's J2 (oblateness) coefficient and equatorial radius, used for the nodal precession. */
export const EARTH_J2 = 1.08263e-3;
export const EARTH_EQUATORIAL_RADIUS_KM = 6378.137;
/** Rate the orbit plane must turn to stay sun-synchronous: once per year, rad/s. */
export const SSO_PRECESSION_RAD_S = (2 * Math.PI) / (365.2422 * DAY_S);

// ---------- T12.1 Basics ----------

/** Speed on a circular orbit, km/s. */
export function orbitalSpeedKmS(altitudeKm: number): number {
  return Math.sqrt(EARTH_MU_KM3_S2 / (EARTH_RADIUS_KM + altitudeKm));
}

/** Speed of the point below the satellite over the ground (Earth's rotation ignored), km/s. */
export function groundSpeedKmS(altitudeKm: number): number {
  return (orbitalSpeedKmS(altitudeKm) * EARTH_RADIUS_KM) / (EARTH_RADIUS_KM + altitudeKm);
}

/** Orbits flown per day. */
export function orbitsPerDay(altitudeKm: number): number {
  return DAY_S / orbitalPeriodS(altitudeKm);
}

/**
 * Fraction of each orbit spent in Earth's shadow (cylindrical shadow).
 * betaDeg is the angle between the orbit plane and the Sun direction; 0 is the worst case.
 */
export function eclipseFraction(altitudeKm: number, betaDeg = 0): number {
  const r = EARTH_RADIUS_KM + altitudeKm;
  const beta = Math.abs(betaDeg) * RAD;
  if (Math.sin(beta) >= EARTH_RADIUS_KM / r) return 0;
  const x = Math.sqrt(altitudeKm ** 2 + 2 * EARTH_RADIUS_KM * altitudeKm) / (r * Math.cos(beta));
  return Math.acos(Math.min(1, x)) / Math.PI;
}

/** Inclination that makes a circular orbit sun-synchronous (J2 precession of one turn per year), degrees. */
export function ssoInclinationDeg(altitudeKm: number): number {
  const a = EARTH_RADIUS_KM + altitudeKm;
  const n = Math.sqrt(EARTH_MU_KM3_S2 / a ** 3);
  const cosI = -SSO_PRECESSION_RAD_S / (1.5 * n * EARTH_J2 * (EARTH_EQUATORIAL_RADIUS_KM / a) ** 2);
  return Math.acos(Math.max(-1, Math.min(1, cosI))) / RAD;
}

// ---------- T12.2 Lifetime (R4) ----------

/**
 * Plausible years until a small satellite without propulsion re-enters, by altitude
 * (moderate solar activity, typical CubeSat/smallsat area-to-mass ratio). Game values, not a prediction.
 */
export type LifetimeTable = readonly { altitudeKm: number; years: number }[];
export const DECAY_LIFETIME_TABLE: LifetimeTable = [
  { altitudeKm: 250, years: 0.02 },
  { altitudeKm: 300, years: 0.1 },
  { altitudeKm: 350, years: 0.4 },
  { altitudeKm: 400, years: 1 },
  { altitudeKm: 450, years: 2.5 },
  { altitudeKm: 500, years: 5 },
  { altitudeKm: 550, years: 10 },
  { altitudeKm: 600, years: 20 },
  { altitudeKm: 650, years: 35 },
  { altitudeKm: 700, years: 60 },
  { altitudeKm: 800, years: 150 },
];

/** Years until the orbit decays, interpolated (log-linear) from DECAY_LIFETIME_TABLE. */
export function decayLifetimeYears(altitudeKm: number, table: LifetimeTable = DECAY_LIFETIME_TABLE): number {
  const t = table;
  const first = t[0]!;
  const last = t[t.length - 1]!;
  if (altitudeKm <= first.altitudeKm) return altitudeKm < 150 ? 0 : first.years;
  if (altitudeKm >= last.altitudeKm) return last.years;
  const i = t.findIndex((p) => p.altitudeKm >= altitudeKm);
  const lo = t[i - 1]!;
  const hi = t[i]!;
  const f = (altitudeKm - lo.altitudeKm) / (hi.altitudeKm - lo.altitudeKm);
  return Math.exp(Math.log(lo.years) + f * (Math.log(hi.years) - Math.log(lo.years)));
}

/** Delta-v per year needed to hold the altitude against drag, m/s. Calibrated so 400 km needs 25 m/s per year. */
export function dragMakeupDvMsPerYear(altitudeKm: number, table: LifetimeTable = DECAY_LIFETIME_TABLE): number {
  return 25 / decayLifetimeYears(altitudeKm, table);
}

export interface Propulsion {
  /** Total impulse of the propulsion system, N·s (the part's performance value; 0 for "none"). */
  totalImpulseNs: number;
  /** Spacecraft mass, kg. */
  massKg: number;
}

export interface Lifetime {
  decayYears: number;
  /** Extra years the propulsion buys by raising the orbit against drag. */
  propulsionYears: number;
  years: number;
}

/** Mission lifetime: natural decay, plus the years the propulsion can hold the altitude. Propulsion "none" adds nothing. */
export function missionLifetime(
  altitudeKm: number,
  propulsion?: Propulsion,
  table: LifetimeTable = DECAY_LIFETIME_TABLE,
): Lifetime {
  const decayYears = decayLifetimeYears(altitudeKm, table);
  let propulsionYears = 0;
  if (propulsion && propulsion.totalImpulseNs > 0 && propulsion.massKg > 0) {
    const dvMs = propulsion.totalImpulseNs / propulsion.massKg;
    propulsionYears = dvMs / dragMakeupDvMsPerYear(altitudeKm, table);
  }
  return { decayYears, propulsionYears, years: decayYears + propulsionYears };
}

// ---------- T12.3 Revisit (R1) ----------

export interface Target {
  latitudeDeg: number;
  /** Width of the region to watch, km. */
  widthKm: number;
}

/** Placeholder target until the mission card carries one: a ~1,000 km region at mid latitude (APIDoc.md paper check). */
export const DEFAULT_TARGET: Target = { latitudeDeg: 40, widthKm: 1000 };

/**
 * Daylight views of the target region per day, on average, for one satellite.
 * Each orbit crosses the target's latitude twice (one crossing in daylight on average); a crossing sees the region
 * when the swath overlaps it, so the chance per crossing is (swath + region width) over the length of the latitude
 * circle, measured along it (the track crosses the circle at an angle).
 */
export function revisitsPerDay(
  swathKm: number,
  altitudeKm: number,
  inclinationDeg: number,
  target = DEFAULT_TARGET,
): number {
  const lat = Math.abs(target.latitudeDeg) * RAD;
  const reach = (swathKm + target.widthKm) / 2 / EARTH_RADIUS_KM;
  const maxLat = Math.min(inclinationDeg, 180 - inclinationDeg) * RAD;
  if (lat > maxLat + reach) return 0;
  const circleKm = 2 * Math.PI * EARTH_RADIUS_KM * Math.cos(lat);
  // Angle of the ground track to the north direction: sin A = cos i / cos lat.
  const sinA = Math.min(1, Math.abs(Math.cos(inclinationDeg * RAD)) / Math.cos(lat));
  const cosA = Math.max(0.1, Math.sqrt(1 - sinA ** 2));
  const chance = Math.min(1, (swathKm + target.widthKm) / cosA / circleKm);
  return orbitsPerDay(altitudeKm) * chance;
}

/** Average time between daylight views of the target, hours (Infinity if never seen). */
export function revisitHours(
  swathKm: number,
  altitudeKm: number,
  inclinationDeg: number,
  target = DEFAULT_TARGET,
): number {
  const n = revisitsPerDay(swathKm, altitudeKm, inclinationDeg, target);
  return n > 0 ? 24 / n : Infinity;
}

// ---------- T12.4 Ground contact and data (R3) ----------

/** Lowest elevation at which a ground station can talk to the satellite, degrees. */
export const DEFAULT_MIN_ELEVATION_DEG = 10;
/** Share of contact time that carries useful data (acquisition, protocol overhead). */
export const LINK_EFFICIENCY = 0.8;

/**
 * Average contact minutes per day: each station sees the satellite while it is inside the station's coverage cap,
 * which on average is the cap's share of the sphere, (1 - cos λ) / 2.
 */
export function contactMinutesPerDay(
  altitudeKm: number,
  stations: number,
  minElevationDeg = DEFAULT_MIN_ELEVATION_DEG,
): number {
  const lambda = coverageHalfAngleRad(altitudeKm, minElevationDeg);
  return (Math.max(0, stations) * 1440 * (1 - Math.cos(lambda))) / 2;
}

/** Longest single pass over a station (satellite straight overhead), minutes. */
export function maxPassMinutes(altitudeKm: number, minElevationDeg = DEFAULT_MIN_ELEVATION_DEG): number {
  const lambda = coverageHalfAngleRad(altitudeKm, minElevationDeg);
  return ((2 * lambda) / (2 * Math.PI)) * (orbitalPeriodS(altitudeKm) / 60);
}

/** Data the radio can send per day, GB (1 GB = 1e9 bytes). The radio's rate is the comms part's performance, kbps. */
export function downlinkCapacityGbPerDay(radioKbps: number, contactMinutes: number): number {
  return (radioKbps * 1e3 * contactMinutes * 60 * LINK_EFFICIENCY) / 8 / 1e9;
}

/** Seconds per day spent imaging the target: each view lasts as long as the ground track takes to cross it. */
export function imagingSecondsPerDay(views: number, altitudeKm: number, target = DEFAULT_TARGET): number {
  return (views * target.widthKm) / groundSpeedKmS(altitudeKm);
}

/** Data an instrument produces per day, GB, from its imaging rate (Mbps) and imaging time. */
export function dataProducedGbPerDay(dataRateMbps: number, imagingSeconds: number): number {
  return (dataRateMbps * 1e6 * imagingSeconds) / 8 / 1e9;
}

export interface DataBudget {
  contactMinutes: number;
  capacityGb: number;
  producedGb: number;
  /** What actually reaches the ground: the smaller of produced and capacity. */
  downlinkedGb: number;
}

export function dataPerDay(opts: {
  altitudeKm: number;
  stations: number;
  radioKbps: number;
  producedGb: number;
  minElevationDeg?: number;
}): DataBudget {
  const contactMinutes = contactMinutesPerDay(opts.altitudeKm, opts.stations, opts.minElevationDeg);
  const capacityGb = downlinkCapacityGbPerDay(opts.radioKbps, contactMinutes);
  return {
    contactMinutes,
    capacityGb,
    producedGb: opts.producedGb,
    downlinkedGb: Math.min(capacityGb, opts.producedGb),
  };
}

// ---------- T12.5 Power over an orbit ----------

/** Deepest battery discharge per orbit that still gives a long battery life in LEO. */
export const MAX_DEPTH_OF_DISCHARGE = 0.3;

export interface OrbitPower {
  eclipseFraction: number;
  eclipseMinutes: number;
  /** Solar power averaged over the whole orbit (zero in eclipse), W. */
  averageProducedW: number;
  /** Average produced covers the average draw. */
  energyOk: boolean;
  /** Energy the battery must supply through one eclipse, Wh. */
  eclipseEnergyWh: number;
  /** Battery capacity needed so the eclipse uses at most MAX_DEPTH_OF_DISCHARGE, Wh. */
  requiredBatteryWh: number;
  batteryOk: boolean;
}

/** Power over one orbit: peak solar output is only available in sunlight; the battery carries the eclipse. */
export function orbitPower(opts: {
  altitudeKm: number;
  peakProducedW: number;
  drawnW: number;
  batteryWh: number;
  betaDeg?: number;
}): OrbitPower {
  const f = eclipseFraction(opts.altitudeKm, opts.betaDeg ?? 0);
  const eclipseMinutes = (f * orbitalPeriodS(opts.altitudeKm)) / 60;
  const averageProducedW = opts.peakProducedW * (1 - f);
  const eclipseEnergyWh = (opts.drawnW * eclipseMinutes) / 60;
  const requiredBatteryWh = eclipseEnergyWh / MAX_DEPTH_OF_DISCHARGE;
  return {
    eclipseFraction: f,
    eclipseMinutes,
    averageProducedW,
    energyOk: averageProducedW >= opts.drawnW,
    eclipseEnergyWh,
    requiredBatteryWh,
    batteryOk: opts.batteryWh >= requiredBatteryWh,
  };
}

/**
 * Lunar Ice Hunter physics (design.md section 10), patched-conic level:
 * transfer and insertion delta-v, the rocket equation, a circular polar orbit around the Moon,
 * its eclipse and Earth-occultation, polar coverage and deep-space station contact.
 * Plausible game values, not mission-design accuracy.
 */
import { MAX_DEPTH_OF_DISCHARGE, type OrbitPower } from "./earth-orbit.ts";

export const MOON_RADIUS_KM = 1737.4;
export const MOON_MU_KM3_S2 = 4902.8;
/** Moon's rotation period (sidereal), days. */
export const MOON_SIDEREAL_DAY_D = 27.3217;
/** Standard gravity, for the rocket equation, m/s². */
export const G0_M_S2 = 9.80665;
export const EARTH_MOON_DISTANCE_KM = 384_400;

/** Altitude range the player may pick for the lunar orbit (design.md 10.1). */
export const LUNAR_ALTITUDE_RANGE_KM = { min: 50, max: 200 } as const;
export const DEFAULT_LUNAR_ALTITUDE_KM = 100;

/** Station-keeping table entry: delta-v per year at an altitude. */
export interface StationKeepingPoint {
  altitudeKm: number;
  kmSPerYear: number;
}

/** The mission card's transfer block (shared contract), with defaults filled in. */
export interface LunarTransfer {
  /** Launcher capacity to a trans-lunar trajectory = LEO capacity × this. */
  tliCapacityFactor: number;
  /** Lunar orbit insertion delta-v: one value (at 100 km, a little more lower down) or a table by altitude, km/s. */
  loiDeltaVKmS: number | readonly StationKeepingPoint[];
  /** Station-keeping per year: one value (at 100 km, scaled by altitude) or a table by altitude. */
  stationKeepingKmSPerYear: number | readonly StationKeepingPoint[];
  distanceKm: number;
}

export const DEFAULT_LUNAR_TRANSFER: LunarTransfer = {
  tliCapacityFactor: 0.3,
  loiDeltaVKmS: 0.8,
  stationKeepingKmSPerYear: [
    { altitudeKm: 50, kmSPerYear: 0.15 },
    { altitudeKm: 100, kmSPerYear: 0.1 },
    { altitudeKm: 200, kmSPerYear: 0.05 },
  ],
  distanceKm: EARTH_MOON_DISTANCE_KM,
};

const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

/** Reads a number or an {altitudeKm, value} table (value under any of the given keys). */
function tableOrNumber(raw: unknown, keys: readonly string[]): number | StationKeepingPoint[] | undefined {
  if (num(raw) !== undefined) return num(raw);
  if (!Array.isArray(raw)) return undefined;
  const points = raw
    .map((p: Record<string, unknown>) => ({
      altitudeKm: num(p?.altitudeKm),
      kmSPerYear: keys.map((k) => num(p?.[k])).find((v) => v !== undefined),
    }))
    .filter((p): p is StationKeepingPoint => p.altitudeKm !== undefined && p.kmSPerYear !== undefined)
    .sort((a, b) => a.altitudeKm - b.altitudeKm);
  return points.length ? points : undefined;
}

/** Reads the card's transfer block leniently (any missing field gets the default). */
export function lunarTransferFrom(raw: unknown): LunarTransfer {
  const t = (raw ?? {}) as Record<string, unknown>;
  return {
    tliCapacityFactor: num(t.tliCapacityFactor) ?? DEFAULT_LUNAR_TRANSFER.tliCapacityFactor,
    loiDeltaVKmS: tableOrNumber(t.loiDeltaVKmS, ["kmS", "deltaVKmS", "value"]) ?? DEFAULT_LUNAR_TRANSFER.loiDeltaVKmS,
    stationKeepingKmSPerYear:
      tableOrNumber(t.stationKeepingKmSPerYear, ["kmSPerYear", "deltaVKmSPerYear", "kmS", "value"]) ??
      DEFAULT_LUNAR_TRANSFER.stationKeepingKmSPerYear,
    distanceKm: num(t.distanceKm) ?? DEFAULT_LUNAR_TRANSFER.distanceKm,
  };
}

/** Linear interpolation in an altitude table (clamped at the ends). */
function interpolate(table: readonly StationKeepingPoint[], altitudeKm: number): number {
  if (table.length === 1 || altitudeKm <= table[0]!.altitudeKm) return table[0]!.kmSPerYear;
  for (let i = 1; i < table.length; i++) {
    const a = table[i - 1]!;
    const b = table[i]!;
    if (altitudeKm <= b.altitudeKm) {
      const f = (altitudeKm - a.altitudeKm) / (b.altitudeKm - a.altitudeKm);
      return a.kmSPerYear + f * (b.kmSPerYear - a.kmSPerYear);
    }
  }
  return table[table.length - 1]!.kmSPerYear;
}

/** Insertion delta-v at an altitude, km/s: from the card's table, or its value at 100 km +0.05 km/s per 100 km lower. */
export function loiDeltaVKmS(altitudeKm: number, t: LunarTransfer = DEFAULT_LUNAR_TRANSFER): number {
  const loi = t.loiDeltaVKmS;
  if (typeof loi !== "number") return interpolate(loi, altitudeKm);
  return Math.max(0.1, loi + 0.0005 * (DEFAULT_LUNAR_ALTITUDE_KM - altitudeKm));
}

/** Station-keeping delta-v per year (lunar mascons perturb low orbits): more for lower orbits. */
export function stationKeepingKmSPerYear(altitudeKm: number, t: LunarTransfer = DEFAULT_LUNAR_TRANSFER): number {
  const sk = t.stationKeepingKmSPerYear;
  if (typeof sk === "number") return sk * Math.pow(DEFAULT_LUNAR_ALTITUDE_KM / Math.max(10, altitudeKm), 0.7);
  return interpolate(sk, altitudeKm);
}

/** Rocket equation: propellant (kg) to give a dry mass a delta-v (km/s). */
export function propellantForDeltaVKg(dryMassKg: number, deltaVKmS: number, ispS: number): number {
  if (ispS <= 0) return Infinity;
  return dryMassKg * (Math.exp((deltaVKmS * 1000) / (G0_M_S2 * ispS)) - 1);
}

/** Rocket equation: delta-v (km/s) from a propellant load. */
export function deltaVFromPropellantKmS(dryMassKg: number, propellantKg: number, ispS: number): number {
  if (dryMassKg <= 0 || propellantKg <= 0 || ispS <= 0) return 0;
  return (G0_M_S2 * ispS * Math.log((dryMassKg + propellantKg) / dryMassKg)) / 1000;
}

/** Propellant a thruster can hold, from its total impulse (N·s) and specific impulse: I = m·g0·Isp. */
export function propellantCapacityKg(totalImpulseNs: number, ispS: number): number {
  return ispS > 0 ? totalImpulseNs / (G0_M_S2 * ispS) : 0;
}

/** Circular lunar orbit period, s. */
export function lunarOrbitalPeriodS(altitudeKm: number): number {
  const a = MOON_RADIUS_KM + altitudeKm;
  return 2 * Math.PI * Math.sqrt((a * a * a) / MOON_MU_KM3_S2);
}

/** Orbits per (Earth) day. */
export function lunarOrbitsPerDay(altitudeKm: number): number {
  return 86_400 / lunarOrbitalPeriodS(altitudeKm);
}

/** Share of an orbit in the Moon's shadow (cylindrical shadow, worst case with the Sun in the orbit plane). */
export function lunarEclipseFraction(altitudeKm: number, betaDeg = 0): number {
  const a = MOON_RADIUS_KM + altitudeKm;
  const beta = (Math.abs(betaDeg) * Math.PI) / 180;
  const betaStar = Math.asin(MOON_RADIUS_KM / a);
  if (beta >= betaStar) return 0;
  const h = altitudeKm;
  return Math.acos(Math.sqrt(h * h + 2 * MOON_RADIUS_KM * h) / (a * Math.cos(beta))) / Math.PI;
}

/** Share of an orbit hidden behind the Moon as seen from Earth (averaged over the month: 3/4 of the worst case). */
export function lunarOccultationFraction(altitudeKm: number): number {
  return 0.75 * lunarEclipseFraction(altitudeKm, 0);
}

/** Polar cap the ice map covers: latitudes poleward of this. */
export const POLAR_CAP_LAT_DEG = 80;

/**
 * Share of the two polar caps (poleward of 80°) newly mapped per day.
 * Each orbit crosses each cap's edge twice; the Moon turns slowly under the orbit, so tracks fill in over days.
 * Zero when the orbit is too tilted to reach the caps.
 */
export function polarCoveragePerDay(swathKm: number, altitudeKm: number, inclinationDeg: number): number {
  const reach = inclinationDeg > 90 ? 180 - inclinationDeg : inclinationDeg;
  if (swathKm <= 0 || reach < POLAR_CAP_LAT_DEG) return 0;
  const edgeKm = 2 * Math.PI * MOON_RADIUS_KM * Math.cos((POLAR_CAP_LAT_DEG * Math.PI) / 180);
  return Math.min(1, (2 * lunarOrbitsPerDay(altitudeKm) * swathKm) / edgeKm);
}

/** Days to map the polar caps once (Infinity without coverage). */
export function daysToMapPoles(coveragePerDay: number): number {
  return coveragePerDay > 0 ? Math.ceil(1 / coveragePerDay) : Infinity;
}

/** Share of each orbit spent over the polar caps (instruments image there). */
export function polarImagingFraction(inclinationDeg: number): number {
  const reach = inclinationDeg > 90 ? 180 - inclinationDeg : inclinationDeg;
  if (reach < POLAR_CAP_LAT_DEG) return 0;
  return (2 * 2 * (reach - POLAR_CAP_LAT_DEG)) / 360;
}

/** Hours per day the Moon is above a station's horizon (above 10° elevation). */
export const MOON_VISIBLE_HOURS_PER_STATION = 10;

/**
 * Minutes per day at least one station sees the Moon, from the stations' longitudes
 * (overlapping windows count once), before the spacecraft's own occultation.
 */
export function moonVisibleMinutesPerDay(stationLonDeg: readonly number[]): number {
  if (stationLonDeg.length === 0) return 0;
  const half = (MOON_VISIBLE_HOURS_PER_STATION / 24) * 180;
  let visible = 0;
  for (let deg = 0; deg < 360; deg++) {
    const seen = stationLonDeg.some((lon) => {
      const d = Math.abs((((deg + 0.5 - lon) % 360) + 540) % 360 - 180);
      return d <= half;
    });
    if (seen) visible++;
  }
  return (visible / 360) * 24 * 60;
}

/** Contact minutes per day with the spacecraft in lunar orbit (station windows minus occultation behind the Moon). */
export function lunarContactMinutesPerDay(stationLonDeg: readonly number[], altitudeKm: number): number {
  return moonVisibleMinutesPerDay(stationLonDeg) * (1 - lunarOccultationFraction(altitudeKm));
}

/** Average hours from an observation to Earth: half the daily gap without stations, plus half the occultation. */
export function lunarLatencyHours(visibleMinutesPerDay: number, altitudeKm: number): number {
  if (visibleMinutesPerDay <= 0) return Infinity;
  const gapH = 24 - visibleMinutesPerDay / 60;
  const occultH = (lunarOccultationFraction(altitudeKm) * lunarOrbitalPeriodS(altitudeKm)) / 3600;
  return gapH / 2 + occultH / 2;
}

/** Power over one lunar orbit (same model as Earth: panels only in sunlight, battery through the eclipse). */
export function lunarOrbitPower(opts: {
  altitudeKm: number;
  peakProducedW: number;
  drawnW: number;
  batteryWh: number;
  betaDeg?: number;
}): OrbitPower {
  const f = lunarEclipseFraction(opts.altitudeKm, opts.betaDeg ?? 0);
  const eclipseMinutes = (f * lunarOrbitalPeriodS(opts.altitudeKm)) / 60;
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

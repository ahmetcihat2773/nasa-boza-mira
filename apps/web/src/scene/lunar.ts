/**
 * Lunar helpers for the scenes. Constants mirror packages/sim/src/lunar.ts (not yet exported from the sim index);
 * switch the imports to "@space-mission/sim" once `lunar.ts` is re-exported there.
 */
import type { CircularOrbit, OrbitState, Vec3 } from "@space-mission/sim";
import * as THREE from "three";

export type Destination = "earth-orbit" | "lunar-orbit";

export const MOON_RADIUS_KM = 1737.4;
export const MOON_MU_KM3_S2 = 4902.8;
/** Moon's sidereal rotation rate, rad/s (27.32 days). */
export const MOON_ROTATION_RAD_S = (2 * Math.PI) / (27.3217 * 86_400);
export const LUNAR_ALTITUDE_RANGE_KM = { min: 50, max: 200 } as const;
export const DEFAULT_LUNAR_ALTITUDE_KM = 100;
/** Polar orbit for the ice hunt (design.md 10.1: inclination >= 85°). */
export const LUNAR_INCLINATION_DEG = 90;

const RAD = Math.PI / 180;

/** Period of a circular lunar orbit, seconds. */
export function lunarOrbitalPeriodS(altitudeKm: number): number {
  const a = MOON_RADIUS_KM + altitudeKm;
  return 2 * Math.PI * Math.sqrt(a ** 3 / MOON_MU_KM3_S2);
}

/** Position and velocity on a circular lunar orbit (Moon-centred, z = lunar north), km and km/s. */
export function lunarOrbitState(orbit: CircularOrbit, tS: number): OrbitState {
  const a = MOON_RADIUS_KM + orbit.altitudeKm;
  const n = (2 * Math.PI) / lunarOrbitalPeriodS(orbit.altitudeKm);
  const u = (orbit.phaseDeg ?? 0) * RAD + n * tS;
  const i = orbit.inclinationDeg * RAD;
  const O = (orbit.raanDeg ?? 0) * RAD;
  const [cu, su, ci, si, cO, sO] = [Math.cos(u), Math.sin(u), Math.cos(i), Math.sin(i), Math.cos(O), Math.sin(O)];
  const v = a * n;
  return {
    position: { x: a * (cO * cu - sO * su * ci), y: a * (sO * cu + cO * su * ci), z: a * su * si },
    velocity: { x: v * (-cO * su - sO * cu * ci), y: v * (-sO * su + cO * cu * ci), z: v * cu * si },
  };
}

/** Clamp the design's altitude into the lunar range (the design's own orbit field is reused for the Moon). */
export function lunarAltitudeKm(altitudeKm: number | undefined): number {
  if (altitudeKm === undefined || !Number.isFinite(altitudeKm)) return DEFAULT_LUNAR_ALTITUDE_KM;
  return THREE.MathUtils.clamp(altitudeKm, LUNAR_ALTITUDE_RANGE_KM.min, LUNAR_ALTITUDE_RANGE_KM.max);
}

/** Moon-centred inertial frame (km) to scene units: y up, 1 unit = Moon radius. */
export function toMoonScene(v: Vec3, out = new THREE.Vector3()): THREE.Vector3 {
  return out.set(v.x / MOON_RADIUS_KM, v.z / MOON_RADIUS_KM, -v.y / MOON_RADIUS_KM);
}

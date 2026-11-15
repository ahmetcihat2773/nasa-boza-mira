/**
 * Lunar helpers for the scenes: the Moon-centred orbit state and the scene transform live here
 * (the sim's lunar module holds the physics constants this file re-uses).
 */
import {
  LUNAR_ALTITUDE_RANGE_KM,
  MOON_RADIUS_KM,
  MOON_SIDEREAL_DAY_D,
  lunarOrbitalPeriodS,
  type CircularOrbit,
  type OrbitState,
  type Vec3,
} from "@space-mission/sim";
import * as THREE from "three";

export { LUNAR_ALTITUDE_RANGE_KM, MOON_RADIUS_KM, lunarOrbitalPeriodS };
export type Destination = "earth-orbit" | "lunar-orbit";

/** Moon's sidereal rotation rate, rad/s (27.32 days). */
export const MOON_ROTATION_RAD_S = (2 * Math.PI) / (MOON_SIDEREAL_DAY_D * 86_400);
export const DEFAULT_LUNAR_ALTITUDE_KM = 100;
/** Polar orbit for the ice hunt (design.md 10.1: inclination >= 85°). */
export const LUNAR_INCLINATION_DEG = 90;

const RAD = Math.PI / 180;

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

/** Mean Earth radius, km. */
export const EARTH_RADIUS_KM = 6371;
/** Earth's gravitational parameter, km^3/s^2. */
export const EARTH_MU_KM3_S2 = 398_600.4418;
/** Earth's rotation rate (sidereal), rad/s. */
export const EARTH_ROTATION_RAD_S = 7.2921159e-5;

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** A circular orbit. Angles in degrees. */
export interface CircularOrbit {
  altitudeKm: number;
  inclinationDeg: number;
  /** Right ascension of the ascending node. */
  raanDeg?: number;
  /** Argument of latitude at t = 0. */
  phaseDeg?: number;
}

export interface OrbitState {
  /** Position in the Earth-centred inertial frame (z = north pole), km. */
  position: Vec3;
  /** Velocity in the same frame, km/s. */
  velocity: Vec3;
}

const RAD = Math.PI / 180;

/** Period of a circular orbit at the given altitude, seconds (Kepler's third law). */
export function orbitalPeriodS(altitudeKm: number): number {
  const a = EARTH_RADIUS_KM + altitudeKm;
  return 2 * Math.PI * Math.sqrt(a ** 3 / EARTH_MU_KM3_S2);
}

/** Position and velocity on a circular orbit, t seconds after epoch. */
export function orbitState(orbit: CircularOrbit, tS: number): OrbitState {
  const a = EARTH_RADIUS_KM + orbit.altitudeKm;
  const n = (2 * Math.PI) / orbitalPeriodS(orbit.altitudeKm);
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

/** Earth's rotation angle t seconds after epoch (0 at epoch: Greenwich on the inertial x axis), radians. */
export function earthRotationRad(tS: number): number {
  return (EARTH_ROTATION_RAD_S * tS) % (2 * Math.PI);
}

/** A point on (or above) the rotating Earth, in the inertial frame, km. */
export function geodeticToInertial(latDeg: number, lonDeg: number, tS: number, altitudeKm = 0): Vec3 {
  const r = EARTH_RADIUS_KM + altitudeKm;
  const lat = latDeg * RAD;
  const lon = lonDeg * RAD + earthRotationRad(tS);
  return { x: r * Math.cos(lat) * Math.cos(lon), y: r * Math.cos(lat) * Math.sin(lon), z: r * Math.sin(lat) };
}

/** Elevation of a target above a ground site's local horizon (spherical Earth), degrees. */
export function elevationDeg(site: Vec3, target: Vec3): number {
  const d = { x: target.x - site.x, y: target.y - site.y, z: target.z - site.z };
  const dLen = Math.hypot(d.x, d.y, d.z);
  const sLen = Math.hypot(site.x, site.y, site.z);
  const sinEl = (d.x * site.x + d.y * site.y + d.z * site.z) / (dLen * sLen);
  return Math.asin(Math.max(-1, Math.min(1, sinEl))) / RAD;
}

/** Ground swath width of an instrument looking straight down (flat-Earth approximation), km. */
export function swathWidthKm(fieldOfViewDeg: number, altitudeKm: number): number {
  return 2 * altitudeKm * Math.tan((fieldOfViewDeg * RAD) / 2);
}

/**
 * Earth-central half-angle of a ground station's coverage circle: the satellite is in contact
 * while it is within this angle of the station, seen from Earth's centre. Radians.
 */
export function coverageHalfAngleRad(altitudeKm: number, minElevationDeg: number): number {
  const e = minElevationDeg * RAD;
  const ratio = EARTH_RADIUS_KM / (EARTH_RADIUS_KM + altitudeKm);
  return Math.acos(ratio * Math.cos(e)) - e;
}

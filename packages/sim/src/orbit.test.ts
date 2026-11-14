import { describe, expect, it } from "vitest";
import {
  EARTH_RADIUS_KM,
  coverageHalfAngleRad,
  elevationDeg,
  geodeticToInertial,
  orbitState,
  orbitalPeriodS,
  swathWidthKm,
} from "./orbit.ts";

const len = (v: { x: number; y: number; z: number }) => Math.hypot(v.x, v.y, v.z);

describe("circular orbit", () => {
  it("has a period of about 95 minutes at 525 km", () => {
    expect(orbitalPeriodS(525) / 60).toBeCloseTo(95.1, 0);
  });

  it("keeps a constant radius and speed", () => {
    const orbit = { altitudeKm: 525, inclinationDeg: 97.5, raanDeg: 40 };
    for (const t of [0, 600, 1234, 5000]) {
      const s = orbitState(orbit, t);
      expect(len(s.position)).toBeCloseTo(EARTH_RADIUS_KM + 525, 6);
      expect(len(s.velocity)).toBeCloseTo(7.6, 1);
      // Velocity is perpendicular to the radius on a circular orbit.
      const dot = s.position.x * s.velocity.x + s.position.y * s.velocity.y + s.position.z * s.velocity.z;
      expect(Math.abs(dot)).toBeLessThan(1e-6);
    }
  });

  it("returns to the start after one period and reaches the inclination's latitude", () => {
    const orbit = { altitudeKm: 525, inclinationDeg: 97.5 };
    const p = orbitalPeriodS(525);
    const a = orbitState(orbit, 0).position;
    const b = orbitState(orbit, p).position;
    expect(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)).toBeLessThan(1e-6);
    const top = orbitState(orbit, p / 4).position;
    const latDeg = (Math.asin(top.z / len(top)) * 180) / Math.PI;
    expect(latDeg).toBeCloseTo(180 - 97.5, 6);
  });
});

describe("ground geometry", () => {
  it("sees a satellite straight overhead at 90 degrees elevation", () => {
    const site = geodeticToInertial(78.2, 15.4, 100);
    const sat = geodeticToInertial(78.2, 15.4, 100, 525);
    expect(elevationDeg(site, sat)).toBeCloseTo(90, 6);
  });

  it("computes swath width and coverage circle", () => {
    expect(swathWidthKm(30, 525)).toBeCloseTo(281.3, 1);
    // About 18 degrees of arc (~2000 km radius) for 525 km and a 5 degree mask.
    expect((coverageHalfAngleRad(525, 5) * 180) / Math.PI).toBeCloseTo(17.9, 0);
  });
});

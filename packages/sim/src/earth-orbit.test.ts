import { describe, expect, it } from "vitest";
import {
  contactMinutesPerDay,
  dataPerDay,
  dataProducedGbPerDay,
  decayLifetimeYears,
  downlinkCapacityGbPerDay,
  eclipseFraction,
  groundSpeedKmS,
  imagingSecondsPerDay,
  maxPassMinutes,
  missionLifetime,
  orbitPower,
  orbitalSpeedKmS,
  orbitsPerDay,
  revisitHours,
  revisitsPerDay,
  ssoInclinationDeg,
} from "./earth-orbit.ts";
import { orbitalPeriodS, swathWidthKm } from "./orbit.ts";

describe("T12.1 basics", () => {
  it("matches known periods and speeds", () => {
    expect(orbitalPeriodS(525) / 60).toBeCloseTo(95.1, 0);
    expect(orbitalPeriodS(400) / 60).toBeCloseTo(92.4, 0); // ISS-like
    expect(orbitalSpeedKmS(525)).toBeCloseTo(7.6, 1);
    expect(groundSpeedKmS(525)).toBeCloseTo(7.02, 1);
    expect(orbitsPerDay(525)).toBeCloseTo(15.1, 0);
  });

  it("spends about 36 minutes of each orbit in shadow at 525 km (worst case)", () => {
    expect(eclipseFraction(525)).toBeCloseTo(0.375, 2);
    expect((eclipseFraction(525) * orbitalPeriodS(525)) / 60).toBeCloseTo(35.7, 0);
    expect(eclipseFraction(525, 30)).toBeLessThan(eclipseFraction(525));
    expect(eclipseFraction(525, 75)).toBe(0); // dawn-dusk-like orbit: always in sunlight
  });

  it("gives the known sun-synchronous inclinations", () => {
    expect(ssoInclinationDeg(525)).toBeCloseTo(97.5, 0);
    expect(ssoInclinationDeg(800)).toBeCloseTo(98.6, 0);
    expect(ssoInclinationDeg(400)).toBeLessThan(ssoInclinationDeg(700));
  });
});

describe("T12.2 lifetime (R4)", () => {
  it("decays faster at lower altitude", () => {
    expect(decayLifetimeYears(400)).toBeCloseTo(1, 5);
    expect(decayLifetimeYears(350)).toBeLessThan(1);
    expect(decayLifetimeYears(525)).toBeGreaterThan(5);
    expect(decayLifetimeYears(525)).toBeLessThan(10);
    expect(decayLifetimeYears(600)).toBeGreaterThan(decayLifetimeYears(525));
  });

  it("propulsion 'none' adds nothing; a thruster adds years", () => {
    expect(missionLifetime(350).years).toBe(decayLifetimeYears(350));
    expect(missionLifetime(350, { totalImpulseNs: 0, massKg: 10 }).propulsionYears).toBe(0);
    // Cold gas 40 N·s on a 10 kg CubeSat: 4 m/s, about a year more at 525 km.
    const cold = missionLifetime(525, { totalImpulseNs: 40, massKg: 10 });
    expect(cold.propulsionYears).toBeGreaterThan(0.8);
    expect(cold.propulsionYears).toBeLessThan(1.5);
    // At 350 km a big thruster makes R4 possible.
    expect(missionLifetime(350, { totalImpulseNs: 5000, massKg: 20 }).years).toBeGreaterThan(1);
  });
});

describe("T12.3 revisit (R1)", () => {
  it("a wide camera sees the region daily; a narrow one does not", () => {
    const wide = swathWidthKm(90, 525); // ~1,050 km
    expect(revisitsPerDay(wide, 525, ssoInclinationDeg(525))).toBeGreaterThanOrEqual(1);
    const narrow = swathWidthKm(1.6, 525);
    expect(revisitsPerDay(narrow, 525, 97.5)).toBeLessThan(1); // fails R1
    expect(revisitHours(wide, 525, 97.5)).toBeLessThanOrEqual(24);
  });

  it("a higher orbit with the same camera revisits more often", () => {
    expect(revisitsPerDay(swathWidthKm(40, 600), 600, 97.8)).toBeGreaterThan(
      revisitsPerDay(swathWidthKm(40, 500), 500, 97.4),
    );
  });

  it("never sees a region beyond the orbit's reach", () => {
    const far = { latitudeDeg: 65, widthKm: 500 };
    expect(revisitsPerDay(500, 400, 51.6, far)).toBe(0);
    expect(revisitHours(500, 400, 51.6, far)).toBe(Infinity);
    // Near its turning latitude an inclined orbit lingers, so it revisits more than a polar orbit.
    const near = { latitudeDeg: 50, widthKm: 500 };
    expect(revisitsPerDay(500, 400, 51.6, near)).toBeGreaterThan(revisitsPerDay(500, 400, 90, near));
  });
});

describe("T12.4 ground contact and data (R3)", () => {
  it("gives plausible contact time per station", () => {
    const one = contactMinutesPerDay(525, 1);
    expect(one).toBeGreaterThan(15);
    expect(one).toBeLessThan(40);
    expect(contactMinutesPerDay(525, 2)).toBeCloseTo(2 * one, 6);
    expect(contactMinutesPerDay(700, 1)).toBeGreaterThan(one);
    expect(maxPassMinutes(525)).toBeGreaterThan(7);
    expect(maxPassMinutes(525)).toBeLessThan(12);
  });

  it("an S-band radio with one station misses 1 GB/day; X-band makes it", () => {
    const min = contactMinutesPerDay(525, 1);
    expect(downlinkCapacityGbPerDay(5_000, min)).toBeLessThan(1);
    expect(downlinkCapacityGbPerDay(50_000, min)).toBeGreaterThan(1);
    // 1 GB at 10 Mbps takes 800 s.
    expect(dataProducedGbPerDay(10, 800)).toBeCloseTo(1, 6);
  });

  it("only sends what was produced", () => {
    const produced = dataProducedGbPerDay(20, imagingSecondsPerDay(1, 525));
    const d = dataPerDay({ altitudeKm: 525, stations: 1, radioKbps: 50_000, producedGb: produced });
    expect(d.downlinkedGb).toBe(produced);
    expect(d.capacityGb).toBeGreaterThan(produced);
  });
});

describe("T12.5 power over an orbit", () => {
  it("averages solar power over sunlight and sizes the battery for the eclipse", () => {
    // The paper CubeSat design: 35 W body panels, 21.8 W drawn, 90 Wh battery, 525 km.
    const p = orbitPower({ altitudeKm: 525, peakProducedW: 35, drawnW: 21.8, batteryWh: 90 });
    expect(p.averageProducedW).toBeCloseTo(35 * 0.625, 0);
    expect(p.energyOk).toBe(true);
    expect(p.eclipseEnergyWh).toBeCloseTo((21.8 * 35.7) / 60, 0);
    expect(p.requiredBatteryWh).toBeCloseTo(p.eclipseEnergyWh / 0.3, 6);
    expect(p.batteryOk).toBe(true);
  });

  it("fails when peak power only matches the draw, or the battery is small", () => {
    const p = orbitPower({ altitudeKm: 525, peakProducedW: 20, drawnW: 20, batteryWh: 10 });
    expect(p.energyOk).toBe(false);
    expect(p.batteryOk).toBe(false);
  });
});

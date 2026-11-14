import { groundStations, instruments, launchers, parts, wildfireWatch } from "@space-mission/data";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_GROUND_STATIONS,
  WILDFIRE_WATCH,
  computeBudget,
  launchCostUsd,
  trlPenaltyMonths,
  type Design,
} from "./index.ts";

const part = (id: string) => {
  const p = parts.find((x) => x.id === id);
  if (!p) throw new Error(`no part ${id}`);
  return p;
};
const instrument = (id: string) => {
  const i = instruments.find((x) => x.id === id);
  if (!i) throw new Error(`no instrument ${id}`);
  return i;
};
const launcher = (id: string | number) => {
  const l = launchers.find((x) => x.id === id);
  if (!l) throw new Error(`no launcher ${id}`);
  return l;
};
const station = (id: string) => {
  const g = groundStations.find((x) => x.id === id);
  if (!g) throw new Error(`no station ${id}`);
  return g;
};
const rideshare = launcher("rideshare");
const electron = launcher(26);
const check = (b: ReturnType<typeof computeBudget>, id: string) => b.checks.find((c) => c.id === id);

/** The paper CubeSat design from APIDoc.md (T7.6). */
const cubesat: Design = {
  parts: {
    structure: part("structure-12u-frame"),
    solar: part("solar-12u-body"),
    battery: part("battery-90wh"),
    obc: part("obc-rad-tolerant"),
    adcs: part("adcs-integrated-cubesat"),
    propulsion: part("propulsion-none"),
    comms: part("comms-xband-cubesat"),
  },
  instruments: [instrument("vis-wide-cubesat"), instrument("swir-fire-cubesat")],
  launcher: rideshare,
};

describe("mission card (T11.3)", () => {
  it("comes from @space-mission/data", () => {
    expect(WILDFIRE_WATCH.budgetUsd).toBe(wildfireWatch.constraints.budgetUsd);
    expect(WILDFIRE_WATCH.thresholds).toEqual({ minRevisitsPerDay: 1, minDownlinkGbPerDay: 1, minLifetimeYears: 1 });
    expect(WILDFIRE_WATCH.target.latitudeDeg).toBe(40);
    expect(WILDFIRE_WATCH.lateWaitMonths).toBe(12);
  });
});

describe("computeBudget", () => {
  it("passes the paper CubeSat design on a rideshare", () => {
    const b = computeBudget(cubesat, WILDFIRE_WATCH);
    expect(b.checks.filter((c) => !c.ok)).toEqual([]);
    expect(b.pass).toBe(true);
    expect(b.devMonths).toBe(15);
    expect(b.teamCostUsd).toBe(3_000_000);
    expect(b.orbit).toMatchObject({ type: "sun-synchronous", altitudeKm: 525, fixedByLauncher: true });
    expect(b.costByRole.launch).toBe(350_000);
    expect(b.costByRole.science).toBe(2_600_000);
    expect(b.costByRole.ground).toBe(397_000 + DEFAULT_GROUND_STATIONS[0]!.costUsd);
    expect(b.allocationByRole.launch).toBe(10_500_000);
    expect(b.revisitsPerDay).toBeGreaterThanOrEqual(1);
    expect(b.lifetimeYears).toBeCloseTo(6, 5);
  });

  it("adds up the TRL penalties of all parts and instruments (T11.1)", () => {
    const b = computeBudget(
      {
        ...cubesat,
        parts: { ...cubesat.parts, adcs: part("adcs-precision-cubesat"), propulsion: part("propulsion-green-mono") },
        instruments: [instrument("mwir-fire-cubesat")],
      },
      WILDFIRE_WATCH,
    );
    const mwir = trlPenaltyMonths(instrument("mwir-fire-cubesat").trl) ?? 0;
    expect(b.trlPenaltyMonths).toBe(3 + 9 + mwir);
    expect(b.devMonths).toBe(15 + 3 + 9 + mwir);
  });

  it("charges the team cost to the roles by allocation (T11.2)", () => {
    const b = computeBudget(cubesat, WILDFIRE_WATCH);
    expect(b.teamCostByRole).toEqual({ launch: 1_050_000, spacecraft: 900_000, science: 750_000, ground: 300_000 });
    expect(b.spendByRole.launch).toBe(350_000 + 1_050_000);
    const spent = Object.values(b.spendByRole).reduce((s, c) => s + c, 0);
    expect(spent).toBeCloseTo(b.totalCostUsd, 6);
  });

  it("counts instruments in mass, power and Science cost (T13.1)", () => {
    const bare = computeBudget({ ...cubesat, instruments: [] }, WILDFIRE_WATCH);
    const b = computeBudget(cubesat, WILDFIRE_WATCH);
    const ins = cubesat.instruments!;
    expect(b.massKg - bare.massKg).toBeCloseTo(ins[0]!.massKg + ins[1]!.massKg, 6);
    expect(b.powerDrawnW - bare.powerDrawnW).toBeCloseTo(ins[0]!.powerW + ins[1]!.powerW, 6);
    expect(b.costByRole.science - bare.costByRole.science).toBe(ins[0]!.costUsd + ins[1]!.costUsd);
    expect(b.dataProducedGbPerDay).toBeGreaterThan(0);
    expect(check(bare, "incomplete")?.message).toContain("instrument");
  });

  it("fails when peak power is short", () => {
    const b = computeBudget({ ...cubesat, parts: { ...cubesat.parts, solar: part("solar-6u-body") } }, WILDFIRE_WATCH);
    expect(check(b, "power")?.ok).toBe(false);
    expect(b.pass).toBe(false);
  });

  it("reports missing subsystems and launcher", () => {
    const b = computeBudget({ parts: {} }, WILDFIRE_WATCH);
    expect(check(b, "incomplete")?.message).toContain("launcher");
    expect(b.pass).toBe(false);
  });
});

describe("requirements R1–R4 (T13.2)", () => {
  it("R1 fails with a narrow camera and says why", () => {
    const b = computeBudget(
      { ...cubesat, instruments: [instrument("vis-narrow-cubesat"), instrument("swir-fire-cubesat")] },
      WILDFIRE_WATCH,
    );
    const r1 = check(b, "R1");
    expect(r1?.ok).toBe(false);
    expect(r1?.message).toContain("wider-angle");
  });

  it("R2 needs a fire-detecting instrument", () => {
    const b = computeBudget({ ...cubesat, instruments: [instrument("vis-wide-cubesat")] }, WILDFIRE_WATCH);
    expect(check(b, "R2")?.ok).toBe(false);
    expect(check(b, "R1")?.ok).toBe(true);
  });

  it("R3 fails with a slow radio and one mid-latitude station; more stations help", () => {
    const sband = { ...cubesat, parts: { ...cubesat.parts, comms: part("comms-sband") } };
    const one = computeBudget({ ...sband, groundStations: [station("wallops")] }, WILDFIRE_WATCH);
    expect(check(one, "R3")?.ok).toBe(false);
    expect(check(one, "R3")?.message).toContain("ground station");
    const two = computeBudget({ ...sband, groundStations: [station("wallops"), station("svalbard")] }, WILDFIRE_WATCH);
    expect(two.downlinkCapacityGbPerDay).toBeGreaterThan(one.downlinkCapacityGbPerDay);
    expect(check(two, "R3")?.ok).toBe(true);
  });

  it("R4 fails low without propulsion and passes with a thruster", () => {
    const low = { ...cubesat, launcher: electron, orbit: { type: "sun-synchronous" as const, altitudeKm: 400 } };
    const b = computeBudget(low, WILDFIRE_WATCH);
    expect(b.lifetimeYears).toBeLessThan(1);
    expect(check(b, "R4")?.ok).toBe(false);
    expect(check(b, "R4")?.message).toContain("propulsion");
    const withProp = computeBudget(
      { ...low, parts: { ...low.parts, propulsion: part("propulsion-feep-cubesat") } },
      WILDFIRE_WATCH,
    );
    expect(check(withProp, "R4")?.ok).toBe(true);
  });
});

describe("launcher compatibility (T13.3)", () => {
  it("a rideshare keeps its fixed orbit and flags a different chosen orbit", () => {
    const b = computeBudget({ ...cubesat, orbit: { type: "inclined", altitudeKm: 600 } }, WILDFIRE_WATCH);
    expect(b.orbit.altitudeKm).toBe(525);
    expect(check(b, "launcher-orbit")?.ok).toBe(false);
  });

  it("a dedicated launcher flies the chosen orbit, with LEO capacity for an inclined orbit", () => {
    const b = computeBudget(
      { ...cubesat, launcher: electron, orbit: { type: "inclined", altitudeKm: 600 } },
      WILDFIRE_WATCH,
    );
    expect(b.orbit).toMatchObject({ type: "inclined", altitudeKm: 600, inclinationDeg: 45 });
    expect(b.launcherCapacityKg).toBe(electron.leoCapacityKg);
    expect(check(b, "launcher-orbit")?.ok).toBe(true);
  });

  it("charges rideshare per kg above 50 kg", () => {
    expect(launchCostUsd(rideshare, 60)).toBe(350_000 + 10 * 7_000);
  });
});

describe("deadline penalty (T13.4)", () => {
  it("missing the deadline adds a 12-month wait at team cost but does not fail the design", () => {
    // Small satellite (24 months) + TRL 6 propulsion (+9) = 33 > 30 months.
    const smallsat: Design = {
      parts: {
        structure: part("structure-smallsat-bus"),
        solar: part("solar-smallsat-deployable"),
        battery: part("battery-600wh"),
        obc: part("obc-rad-tolerant"),
        adcs: part("adcs-wheels-smallsat"),
        propulsion: part("propulsion-green-mono"),
        comms: part("comms-xband-cubesat"),
      },
      instruments: [instrument("multiband-smallsat")],
      launcher: electron,
      orbit: { type: "sun-synchronous", altitudeKm: 600 },
    };
    const b = computeBudget(smallsat, WILDFIRE_WATCH);
    expect(b.devMonths).toBe(33);
    expect(b.deadline).toEqual({ met: false, waitMonths: 12, readyMonths: 45, scheduleScoreZero: true });
    expect(b.teamCostUsd).toBe(45 * 200_000);
    const schedule = check(b, "schedule");
    expect(schedule?.ok).toBe(false);
    expect(schedule?.blocking).toBe(false);
    expect(b.checks.filter((c) => !c.ok).map((c) => c.id)).toEqual(["schedule"]);
    expect(b.pass).toBe(true);
  });
});

describe("rules", () => {
  it("maps TRL to penalty months (TRL 4 or lower is locked)", () => {
    expect([9, 8, 7, 6, 5, 4].map(trlPenaltyMonths)).toEqual([0, 3, 3, 9, 9, null]);
  });
});

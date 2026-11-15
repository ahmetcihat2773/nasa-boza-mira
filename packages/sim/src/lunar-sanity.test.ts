import { describe, expect, it } from "vitest";
import { allLaunchers, instruments, lunarIceHunter, parts } from "@space-mission/data";
import { computeBudget, missionFromCard } from "./budget.ts";
import { drawEvents, runMission } from "./run.ts";

const part = (id: string) => {
  const p = parts.find((x) => x.id === id);
  if (!p) throw new Error(`no part ${id}`);
  return p;
};
const MISSION = missionFromCard(lunarIceHunter);

/** A plausible lunar design: bipropellant for insertion, two ice instruments, the lunar rideshare. */
const design = {
  parts: {
    structure: part("structure-smallsat-composite"),
    solar: part("solar-smallsat-deployable"),
    battery: part("battery-600wh"),
    obc: part("obc-rad-tolerant"),
    adcs: part("adcs-wheels-smallsat"),
    propulsion: part("propulsion-biprop-lunar"),
    comms: part("comms-xband-smallsat"),
  },
  instruments: instruments.filter((i) => ["neutron-spectrometer", "mini-radar-ice"].includes(i.id)),
  launcher: allLaunchers.find((l) => l.id === "lunar-rideshare")!,
  orbit: { type: "polar" as const, altitudeKm: 100 },
};

describe("Lunar Ice Hunter budget", () => {
  const b = computeBudget(design, MISSION);

  it("meets L1–L5 for a plausible small-satellite design", () => {
    for (const id of ["L1", "L2", "L3", "L4", "L5"]) expect(b.checks.find((c) => c.id === id)?.ok, id).toBe(true);
    expect(b.pass).toBe(true);
  });

  it("counts propellant towards the launcher mass limit and locks 6U and no-propulsion", () => {
    expect(b.deltaV?.propellantKg).toBeGreaterThan(0);
    expect(b.massKg).toBeCloseTo((b.deltaV?.dryMassKg ?? 0) + (b.deltaV?.propellantKg ?? 0));
    expect(b.massKg).toBeLessThanOrEqual(b.launcherCapacityKg ?? 0);
    const sixU = computeBudget(
      { ...design, parts: { ...design.parts, structure: part("structure-6u-frame") } },
      MISSION,
    );
    expect(sixU.checks.find((c) => c.id === "mission-lock")?.ok).toBe(false);
    const noProp = computeBudget(
      { ...design, parts: { ...design.parts, propulsion: part("propulsion-none") } },
      MISSION,
    );
    for (const id of ["mission-lock", "L4", "L5"]) expect(noProp.checks.find((c) => c.id === id)?.ok, id).toBe(false);
  });

  it("waits a year when development misses the lunar rideshare's fixed month", () => {
    // baseDevMonths.smallsat (30) + low-TRL penalties pushes development past the rideshare's month 30.
    expect(b.devMonths).toBeGreaterThan(30);
    expect(b.deadline.waitMonths).toBeGreaterThanOrEqual(12);
  });
});

describe("Lunar Ice Hunter run", () => {
  it("draws lunar events (shared general events plus the four lunar ones)", () => {
    const drawn = drawEvents(MISSION, 42);
    expect(drawn.length).toBeGreaterThanOrEqual(3);
    expect(drawn.every((e) => e.missions.includes("lunar-ice-hunter"))).toBe(true);
  });

  it("meets the bonus objectives of a two-instrument, low-orbit design", () => {
    const r = runMission(design, MISSION, 42, {}, {});
    expect(r.bonuses.find((x) => x.id === "second-ice-method")?.met).toBe(true);
    expect(r.bonuses.find((x) => x.id === "low-orbit")?.met).toBe(true);
    expect(r.bonuses.find((x) => x.id === "fast-data")?.met).toBe(true);
  });

  it("scores science from the lunar instrument values, not the wildfire ones", () => {
    const r = runMission(design, MISSION, 42);
    if (r.success) expect(r.score).not.toBeNull();
    // Even a failed run computed its bonuses without the wildfire value: a fire-only design finds no ice.
    const fireDesign = {
      ...design,
      instruments: instruments.filter((i) => i.id === "fire-imager-smallsat"),
    };
    const r2 = runMission(fireDesign, MISSION, 42);
    expect(r2.success).toBe(false);
    expect(r2.failureReasons.join(" ")).toContain("ice");
  });
});

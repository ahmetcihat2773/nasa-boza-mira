import { launchers, parts } from "@space-mission/data";
import { describe, expect, it } from "vitest";
import { WILDFIRE_WATCH, computeBudget, launchCostUsd, trlPenaltyMonths, type Design } from "./index.ts";

const part = (id: string) => {
  const p = parts.find((x) => x.id === id);
  if (!p) throw new Error(`no part ${id}`);
  return p;
};
const rideshare = launchers.find((l) => l.id === "rideshare");
if (!rideshare) throw new Error("no rideshare launcher");

const goodDesign: Design = {
  parts: {
    structure: part("structure-6u-frame"),
    solar: part("solar-6u-deployable"),
    battery: part("battery-90wh"),
    obc: part("obc-rad-tolerant"),
    adcs: part("adcs-integrated-cubesat"),
    propulsion: part("propulsion-none"),
    comms: part("comms-sband"),
  },
  launcher: rideshare,
};

describe("computeBudget", () => {
  it("passes a simple 6U design on a rideshare", () => {
    const b = computeBudget(goodDesign, WILDFIRE_WATCH);
    expect(b.checks.filter((c) => !c.ok)).toEqual([]);
    expect(b.pass).toBe(true);
    expect(b.devMonths).toBe(15);
    expect(b.teamCostUsd).toBe(3_000_000);
    expect(b.costByRole.launch).toBe(350_000);
    expect(b.costByRole.ground).toBe(219_000);
    expect(b.allocationByRole.launch).toBe(10_500_000);
  });

  it("adds the worst TRL penalty and fails when power is short", () => {
    const b = computeBudget(
      {
        ...goodDesign,
        parts: { ...goodDesign.parts, solar: part("solar-6u-body"), propulsion: part("propulsion-green-mono") },
      },
      WILDFIRE_WATCH,
    );
    expect(b.devMonths).toBe(24);
    expect(b.checks.find((c) => c.id === "power")?.ok).toBe(false);
    expect(b.pass).toBe(false);
  });

  it("reports missing subsystems and launcher", () => {
    const b = computeBudget({ parts: {} }, WILDFIRE_WATCH);
    expect(b.checks.find((c) => c.id === "incomplete")?.message).toContain("launcher");
    expect(b.pass).toBe(false);
  });
});

describe("rules", () => {
  it("maps TRL to penalty months (TRL 4 or lower is locked)", () => {
    expect([9, 8, 7, 6, 5, 4].map(trlPenaltyMonths)).toEqual([0, 3, 3, 9, 9, null]);
  });
  it("charges rideshare per kg above 50 kg", () => {
    expect(launchCostUsd(rideshare, 60)).toBe(350_000 + 10 * 7_000);
  });
});

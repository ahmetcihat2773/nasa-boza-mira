import { computeBudget } from "@space-mission/sim";
import { describe, expect, it } from "vitest";
import { MISSIONS, starterDesign, transferMeters } from "./missions.ts";

describe("starter designs", () => {
  for (const m of MISSIONS) {
    it(`${m.id}: the starter design passes every blocking check`, () => {
      const b = computeBudget(starterDesign(m.mission), m.mission);
      expect(
        b.pass,
        b.checks
          .filter((c) => !c.ok)
          .map((c) => c.id)
          .join(", "),
      ).toBe(true);
    });
  }

  it("only the lunar starter shows delta-v on the dashboard", () => {
    for (const m of MISSIONS) {
      const b = computeBudget(starterDesign(m.mission), m.mission);
      if (m.mission.destination === "lunar-orbit") {
        const t = transferMeters(b);
        expect(t?.propellantKg).toBeGreaterThan(0);
        expect(t!.availableKmS).toBeGreaterThanOrEqual(t!.neededKmS);
      } else {
        expect(transferMeters(b)).toBeNull();
      }
    }
  });
});

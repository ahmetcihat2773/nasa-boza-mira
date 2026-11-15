import { describe, expect, it } from "vitest";
import {
  AUTOPILOT_SCENARIO,
  applyRecovery,
  autoDesign,
  autopilotMission,
  chooseRecovery,
  evaluateDesign,
  fromDesignIds,
  hohmannDeltaVMs,
  launchTelemetry,
  situationFor,
  templateDesign,
  toDesignIds,
} from "./autopilot.ts";

const mission = autopilotMission();

describe("AI Mission Control scenario", () => {
  it("needs roughly 84 m/s to climb from 375 km to 525 km", () => {
    expect(hohmannDeltaVMs(375, 525)).toBeGreaterThan(80);
    expect(hohmannDeltaVMs(375, 525)).toBeLessThan(90);
    expect(hohmannDeltaVMs(525, 525)).toBe(0);
  });

  it("the template passes the sim but fails C1: it has no thruster", () => {
    const ev = evaluateDesign(templateDesign(), mission);
    expect(ev.budget.pass).toBe(true);
    expect(ev.failures.map((f) => f.id)).toEqual(["C1"]);
  });

  it("the built-in designer repairs the template into a passing design", () => {
    const steps = autoDesign(templateDesign(), mission);
    const last = steps[steps.length - 1]!;
    expect(steps[0]!.pass).toBe(false);
    expect(last.pass).toBe(true);
    const { design, problems } = fromDesignIds(last.ids);
    expect(problems).toEqual([]);
    expect(evaluateDesign(design, mission).pass).toBe(true);
    expect(design.parts.propulsion?.id).not.toBe("propulsion-none");
  });

  it("design ids round-trip and unknown ids are reported", () => {
    const ids = toDesignIds(templateDesign());
    expect(toDesignIds(fromDesignIds(ids).design)).toEqual(ids);
    const bad = fromDesignIds({ ...ids, parts: { ...ids.parts, solar: "battery-90wh" }, instruments: ["nope"] });
    expect(bad.problems).toHaveLength(2);
  });

  it("telemetry flags the low release, and the monitor's fix meets R4 again", () => {
    const steps = autoDesign(templateDesign(), mission);
    const { design } = fromDesignIds(steps[steps.length - 1]!.ids);
    const frames = launchTelemetry(design, mission);
    const released = frames.find((f) => f.label === "Spacecraft released")!;
    expect(released.expectedAltitudeKm - released.altitudeKm).toBe(AUTOPILOT_SCENARIO.anomaly.shortfallKm);
    expect(released.alert).toBeDefined();
    expect(frames.filter((f) => f.tS < 560).every((f) => !f.alert)).toBe(true);

    const sit = situationFor(design, mission);
    const nothing = sit.options.find((o) => o.id === "do-nothing")!;
    expect(nothing.meetsLifetime).toBe(false);
    const choice = chooseRecovery(sit);
    expect(choice.optionId).toBe("raise-full");
    const out = applyRecovery(design, mission, choice.optionId);
    expect(out.lifetimeMet).toBe(true);
    expect(out.burn[out.burn.length - 1]!.altitudeKm).toBe(sit.plannedAltitudeKm);
  });

  it("without a thruster no climb is feasible and the mission loses R4", () => {
    const sit = situationFor(templateDesign(), mission);
    expect(sit.options.filter((o) => o.id !== "do-nothing").every((o) => !o.feasible)).toBe(true);
    expect(chooseRecovery(sit).optionId).toBe("do-nothing");
    expect(applyRecovery(templateDesign(), mission, "raise-full").lifetimeMet).toBe(false);
  });
});

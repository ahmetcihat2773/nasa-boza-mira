import { gameEvents, instruments, launchers, parts, realMissions } from "@space-mission/data";
import { describe, expect, it } from "vitest";
import {
  WILDFIRE_WATCH,
  computeBudget,
  drawEvents,
  nearestRealMission,
  planEvents,
  roll,
  runMission,
  starsFor,
  type Design,
} from "./index.ts";

const part = (id: string) => parts.find((x) => x.id === id)!;
const instrument = (id: string) => instruments.find((x) => x.id === id)!;
const rideshare = launchers.find((l) => l.id === "rideshare")!;

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
const seeds = Array.from({ length: 40 }, (_, i) => i + 1);

describe("seeded run (T14.1)", () => {
  it("is deterministic", () => {
    expect(runMission(cubesat, WILDFIRE_WATCH, 42)).toEqual(runMission(cubesat, WILDFIRE_WATCH, 42));
    expect(roll(7, "x")).toBe(roll(7, "x"));
    expect(roll(7, "x")).not.toBe(roll(8, "x"));
  });

  it("draws 3–5 distinct pool events in phase order", () => {
    const order = ["development", "launch", "operations"];
    for (const s of seeds) {
      const ev = drawEvents(WILDFIRE_WATCH, s);
      expect(ev.length).toBeGreaterThanOrEqual(3);
      expect(ev.length).toBeLessThanOrEqual(5);
      expect(new Set(ev.map((e) => e.id)).size).toBe(ev.length);
      expect(ev.every((e) => e.rolled === "pool")).toBe(true);
      const idx = ev.map((e) => order.indexOf(e.phase));
      expect(idx).toEqual([...idx].sort((a, b) => a - b));
    }
  });

  it("does not fly a design that fails its review", () => {
    const r = runMission({ ...cubesat, instruments: [instrument("vis-wide-cubesat")] }, WILDFIRE_WATCH, 1);
    expect(r.success).toBe(false);
    expect(r.score).toBeNull();
    expect(r.failureReasons.join(" ")).toContain("R2");
  });
});

describe("launch failure (T14.2)", () => {
  it("follows the launcher's success rate", () => {
    const sure = { ...rideshare, successRate: 1 };
    const doomed = { ...rideshare, successRate: 0 };
    expect(runMission({ ...cubesat, launcher: sure }, WILDFIRE_WATCH, 3).launch?.ok).toBe(true);
    const lost = runMission({ ...cubesat, launcher: doomed }, WILDFIRE_WATCH, 3);
    expect(lost.launch?.ok).toBe(false);
    expect(lost.success).toBe(false);
    expect(lost.events.every((e) => e.event.phase !== "operations")).toBe(true);
    expect(lost.causes.some((c) => c.phase === "launch" && c.tone === "bad")).toBe(true);
  });
});

describe("events and decisions (T14.3)", () => {
  it("uses the team's decision, or the default when none is given", () => {
    // Find a seed with a decision to make.
    for (const s of seeds) {
      const plan = planEvents(cubesat, WILDFIRE_WATCH, s);
      const open = plan.find((e) => e.available.length > 1);
      if (!open) continue;
      expect(open.usedDefault).toBe(true);
      expect(open.chosen?.id).toBe(open.available[0]!.id);
      const other = open.available[1]!.id;
      const decided = planEvents(cubesat, WILDFIRE_WATCH, s, { [open.event.id]: other });
      const same = decided.find((e) => e.event.id === open.event.id)!;
      expect(same.chosen?.id).toBe(other);
      expect(same.usedDefault).toBe(false);
      // A decision never changes which events happen.
      expect(decided.map((e) => e.event.id)).toEqual(plan.map((e) => e.event.id));
      return;
    }
    throw new Error("no seed with a decision");
  });

  it("offers propulsion-only options only to designs with propulsion", () => {
    for (const s of seeds) {
      for (const e of planEvents(cubesat, WILDFIRE_WATCH, s)) {
        expect(e.available.some((o) => o.requires === "propulsion")).toBe(false);
      }
    }
  });

  it("a proven design absorbs a test failure", () => {
    const tf = gameEvents.find((e) => e.id === "test-failure")!;
    for (const s of seeds) {
      const e = planEvents(cubesat, WILDFIRE_WATCH, s).find((x) => x.event.id === tf.id);
      if (e) expect(e.absorbed).toBe(true);
    }
  });
});

describe("scoring (T14.4) and cause chain (T14.5)", () => {
  it("scores successful runs from 0 to 1000 with card weights and stars", () => {
    const sure = { ...cubesat, launcher: { ...rideshare, successRate: 1 } };
    let scored = 0;
    for (const s of seeds) {
      const r = runMission(sure, WILDFIRE_WATCH, s);
      if (!r.success) continue;
      scored++;
      const sc = r.score!;
      expect(sc.total).toBeGreaterThan(0);
      expect(sc.total).toBeLessThanOrEqual(1000);
      expect(sc.components.map((c) => c.weight)).toEqual([40, 20, 15, 15, 10]);
      expect(sc.total).toBe(sc.components.reduce((s2, c) => s2 + c.points, 0));
      expect(sc.stars).toBe(starsFor(sc.total));
      expect(r.causes.filter((c) => c.phase === "result").length).toBeGreaterThanOrEqual(6);
    }
    expect(scored).toBeGreaterThan(30);
    expect([starsFor(800), starsFor(600), starsFor(100)]).toEqual([3, 2, 1]);
  });

  it("a missed deadline costs the wait and zeroes the schedule score, but the mission can succeed", () => {
    const late: Design = {
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
      launcher: { ...launchers.find((l) => l.id === 26)!, successRate: 1 },
      orbit: { type: "sun-synchronous", altitudeKm: 600 },
    };
    const r = runMission(late, WILDFIRE_WATCH, 5, {}, {});
    expect(r.deadlineMet).toBe(false);
    expect(r.waitMonths).toBeGreaterThanOrEqual(12);
    expect(r.causes.some((c) => c.text.includes("deadline was missed"))).toBe(true);
    if (r.success) expect(r.score!.components.find((c) => c.id === "schedule")!.value).toBe(0);
  });

  it("coordination that paid off raises the score", () => {
    const sure = { ...cubesat, launcher: { ...rideshare, successRate: 1 } };
    const seed = seeds.find((s) => runMission(sure, WILDFIRE_WATCH, s).success)!;
    const a = runMission(sure, WILDFIRE_WATCH, seed).score!.total;
    const b = runMission(sure, WILDFIRE_WATCH, seed, {}, { requestsPaidOff: 2 }).score!.total;
    expect(b).toBeGreaterThan(a);
  });
});

describe("real-mission match (T14.6)", () => {
  it("matches a fire CubeSat to a small real fire mission", () => {
    const m = nearestRealMission(cubesat, computeBudget(cubesat, WILDFIRE_WATCH));
    expect(realMissions).toContain(m.mission);
    expect(["cubesat", "smallsat"]).toContain(m.mission.sizeClass);
    expect(m.reason).toContain(m.mission.name);
  });
});

describe("instrument fit", () => {
  it("rejects a small-satellite instrument on a CubeSat", () => {
    const b = computeBudget({ ...cubesat, instruments: [instrument("fire-imager-smallsat")] }, WILDFIRE_WATCH);
    expect(b.checks.find((c) => c.id === "instrument-fit")?.ok).toBe(false);
    expect(b.pass).toBe(false);
  });
});

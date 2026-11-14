import { describe, expect, it } from "vitest";
import eventsFile from "../json/events.json" with { type: "json" };
import learningFile from "../json/learning.json" with { type: "json" };
import cardsFile from "../json/mission-cards.json" with { type: "json" };
import missionsFile from "../json/missions.json" with { type: "json" };
import orbitsFile from "../json/orbits.json" with { type: "json" };
import {
  EventsFileSchema,
  GameEventSchema,
  LearningFileSchema,
  MissionCardSchema,
  MissionCardsFileSchema,
  OrbitsFileSchema,
  RealMissionsFileSchema,
  advisorLines,
  altitudeOptions,
  gameEvents,
  glossary,
  groundStations,
  launchers,
  orbitTypes,
  realMissions,
  tourSteps,
  wildfireWatch,
} from "./index.ts";

const issues = (r: { success: boolean; error?: { issues: unknown[] } }) => (r.success ? [] : r.error?.issues);

describe("schemas accept the committed files", () => {
  it.each([
    ["mission-cards.json", MissionCardsFileSchema, cardsFile],
    ["orbits.json", OrbitsFileSchema, orbitsFile],
    ["events.json", EventsFileSchema, eventsFile],
    ["missions.json", RealMissionsFileSchema, missionsFile],
    ["learning.json", LearningFileSchema, learningFile],
  ] as const)("%s", (_, schema, file) => {
    expect(issues(schema.safeParse(file))).toEqual([]);
  });
});

describe("Wildfire Watch mission card", () => {
  it("holds the values the sim hard-codes today", () => {
    expect(wildfireWatch.constraints.budgetUsd).toBe(30_000_000);
    expect(wildfireWatch.allocationsPct).toEqual({ launch: 35, spacecraft: 30, science: 25, ground: 10 });
    expect(wildfireWatch.deadlineMonths).toBe(30);
    expect(wildfireWatch.teamCostPerMonthUsd).toBe(200_000);
    expect(wildfireWatch.baseDevMonths).toEqual({ "6U": 15, "12U": 15, smallsat: 24 });
  });

  it("has requirements R1–R4 and three bonus objectives", () => {
    expect(wildfireWatch.requirements.map((r) => r.id)).toEqual(["R1", "R2", "R3", "R4"]);
    expect(wildfireWatch.bonusObjectives).toHaveLength(3);
  });

  it("rejects allocations that do not sum to 100", () => {
    const bad = { ...wildfireWatch, allocationsPct: { ...wildfireWatch.allocationsPct, launch: 40 } };
    expect(MissionCardSchema.safeParse(bad).success).toBe(false);
  });
});

describe("orbits and ground stations", () => {
  it("offers 400–700 km and the rideshare's 525 km sun-synchronous orbit", () => {
    const km = altitudeOptions.map((a) => a.altitudeKm);
    expect(Math.min(...km)).toBe(400);
    expect(Math.max(...km)).toBe(700);
    const fixed = launchers.find((l) => l.fixedOrbit)?.fixedOrbit;
    expect(fixed && km.includes(fixed.altitudeKm)).toBe(true);
    expect(orbitTypes.map((o) => o.id)).toContain(fixed?.type);
  });

  it("gives every station contact minutes for every orbit type", () => {
    for (const g of groundStations)
      expect(Object.keys(g.contactMinutesPerDay).sort()).toEqual(orbitTypes.map((o) => o.id).sort());
  });
});

describe("events", () => {
  it("has the 9 Wildfire Watch events, launch failure rolled once per run", () => {
    expect(gameEvents).toHaveLength(9);
    expect(gameEvents.filter((e) => e.rolled === "once-per-run").map((e) => e.id)).toEqual(["launch-failure"]);
  });

  it("rejects a decision with a single option", () => {
    const first = gameEvents.find((e) => e.decidedBy !== null);
    if (!first) throw new Error("no decision event");
    expect(GameEventSchema.safeParse({ ...first, options: first.options.slice(0, 1) }).success).toBe(false);
  });
});

describe("real missions and learning texts", () => {
  it("has 10–15 real missions including a fire-detecting CubeSat", () => {
    expect(realMissions.length).toBeGreaterThanOrEqual(10);
    expect(realMissions.some((m) => m.sizeClass === "cubesat" && m.detectsFire)).toBe(true);
  });

  it("explains the key UI terms and has a 5–6 step tour", () => {
    const ids = glossary.map((g) => g.id);
    for (const t of ["trl", "sso", "swath", "downlink", "revisit", "rideshare"]) expect(ids).toContain(t);
    expect(tourSteps.length).toBeGreaterThanOrEqual(5);
  });

  it("has an intro line for every role advisor", () => {
    const intros = advisorLines.filter((a) => a.when === "intro").map((a) => a.role);
    expect(intros.sort()).toEqual(["ground", "launch", "science", "spacecraft"]);
  });
});

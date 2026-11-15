import { describe, expect, it } from "vitest";
import fileContents from "../json/launchers.json" with { type: "json" };
import { LauncherListSchema, LauncherSchema, allLaunchers, launchers } from "./index.ts";

describe("launchers.json", () => {
  it("matches the launcher schema", () => {
    const result = LauncherListSchema.safeParse(fileContents);
    expect(result.success ? [] : result.error.issues).toEqual([]);
  });

  it("is exported validated and unchanged", () => {
    expect(allLaunchers).toEqual(fileContents);
    // The lunar rideshare serves the Moon only, so the Earth list stays at 11.
    expect(launchers.length).toBe(11);
    expect(allLaunchers.length).toBe(12);
  });

  it("has exactly one rideshare entry, with the full rideshare price model", () => {
    const rideshare = launchers.filter((l) => l.fixedOrbit !== undefined);
    expect(rideshare.map((l) => l.id)).toEqual(["rideshare"]);
    expect(rideshare[0]).toMatchObject({ includedKg: 50, costPerKgUsd: 7000 });
  });
});

describe("LauncherSchema", () => {
  const base = launchers.find((l) => l.id !== "rideshare");
  if (!base) throw new Error("no Launch Library 2 launcher in the data");

  it("rejects a sun-synchronous capacity above the low-Earth-orbit capacity", () => {
    expect(LauncherSchema.safeParse({ ...base, ssoCapacityKg: base.leoCapacityKg + 1 }).success).toBe(false);
  });

  it("rejects a launcher without a source for ssoCapacityKg", () => {
    const sources = base.sources.filter((s) => !s.fields.includes("ssoCapacityKg"));
    expect(LauncherSchema.safeParse({ ...base, sources }).success).toBe(false);
  });

  it("rejects an unknown data_quality and unknown fields", () => {
    const badSources = base.sources.map((s) => ({ ...s, data_quality: "guessed" }));
    expect(LauncherSchema.safeParse({ ...base, sources: badSources }).success).toBe(false);
    expect(LauncherSchema.safeParse({ ...base, leoCapacity: 1 }).success).toBe(false);
  });

  it("rejects a partial rideshare price model", () => {
    expect(LauncherSchema.safeParse({ ...base, includedKg: 50 }).success).toBe(false);
  });

  it("rejects duplicate ids in the list", () => {
    expect(LauncherListSchema.safeParse([base, base]).success).toBe(false);
  });
});

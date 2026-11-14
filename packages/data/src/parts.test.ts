import { describe, expect, it } from "vitest";
import fileContents from "../json/parts.json" with { type: "json" };
import { PartSchema, PartsFileSchema, SpacecraftSizeSchema, SubsystemSchema, TierSchema, parts } from "./index.ts";

/** TRL bands of design.md section 1. */
const band = (trl: number) => (trl === 9 ? "9" : trl >= 7 ? "7-8" : trl >= 5 ? "5-6" : "<=4");

describe("parts.json", () => {
  it("matches the parts schema", () => {
    const result = PartsFileSchema.safeParse(fileContents);
    expect(result.success ? [] : result.error.issues).toEqual([]);
  });

  it("is exported validated and unchanged", () => {
    expect(parts).toEqual(fileContents.parts);
  });

  // T6.10 coverage rules.
  it("has every tier in every subsystem", () => {
    for (const subsystem of SubsystemSchema.options) {
      const tiers = new Set(parts.filter((p) => p.subsystem === subsystem).map((p) => p.tier));
      expect([subsystem, [...tiers].sort()]).toEqual([subsystem, [...TierSchema.options].sort()]);
    }
  });

  it("offers every subsystem for every spacecraft size, with at least one part at TRL 5 or higher", () => {
    for (const subsystem of SubsystemSchema.options) {
      for (const size of SpacecraftSizeSchema.options) {
        const usable = parts.filter((p) => p.subsystem === subsystem && p.fits.includes(size) && p.trl >= 5);
        expect(usable.length, `${subsystem} for ${size}`).toBeGreaterThan(0);
      }
    }
  });

  it("covers every TRL band, with a few parts at TRL 4 or lower", () => {
    const bands = new Set(parts.map((p) => band(p.trl)));
    expect([...bands].sort()).toEqual(["5-6", "7-8", "9", "<=4"].sort());
    expect(parts.filter((p) => p.trl <= 4).length).toBeGreaterThanOrEqual(2);
  });

  it("marks every cost as game-design and states the factor once", () => {
    for (const p of parts) {
      const cost = p.sources.filter((s) => s.fields.includes("costUsd"));
      expect(cost.map((s) => s.data_quality)).toEqual(["game-design"]);
    }
    expect(fileContents.costMethod.integrationAndTestFactor).toBeGreaterThan(0);
  });
});

describe("PartSchema", () => {
  const solar = parts.find((p) => p.subsystem === "solar");
  const comms = parts.find((p) => p.subsystem === "comms");
  if (!solar || !comms) throw new Error("missing solar or comms part");

  it("rejects a comms part owned by the Spacecraft role", () => {
    expect(PartSchema.safeParse({ ...comms, role: "spacecraft" }).success).toBe(false);
  });

  it("requires powerProducedW on solar parts only", () => {
    expect(PartSchema.safeParse({ ...solar, powerProducedW: undefined }).success).toBe(false);
    expect(PartSchema.safeParse({ ...comms, powerProducedW: 10 }).success).toBe(false);
  });

  it("rejects a part without a source for its cost or TRL", () => {
    const noCost = comms.sources.filter((s) => !s.fields.includes("costUsd"));
    const noTrl = comms.sources.filter((s) => !s.fields.includes("trl"));
    expect(PartSchema.safeParse({ ...comms, sources: noCost }).success).toBe(false);
    expect(PartSchema.safeParse({ ...comms, sources: noTrl }).success).toBe(false);
  });

  it("rejects a TRL outside 1–9 and unknown fields", () => {
    expect(PartSchema.safeParse({ ...comms, trl: 10 }).success).toBe(false);
    expect(PartSchema.safeParse({ ...comms, price: 1 }).success).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import fileContents from "../json/instruments.json" with { type: "json" };
import { InstrumentSchema, InstrumentsFileSchema, instruments } from "./index.ts";

const cubeSat = (sizes: readonly string[]) => sizes.includes("6U") || sizes.includes("12U");

describe("instruments.json", () => {
  it("matches the instruments schema", () => {
    const result = InstrumentsFileSchema.safeParse(fileContents);
    expect(result.success ? [] : result.error.issues).toEqual([]);
  });

  it("is exported validated and unchanged", () => {
    expect(instruments).toEqual(fileContents.instruments);
  });

  // T7 "Done when" rules.
  it("has a CubeSat instrument that detects daylight fire (R2)", () => {
    expect(instruments.some((i) => cubeSat(i.fits) && i.detects.includes("daylightFire"))).toBe(true);
  });

  it("has at least one instrument that detects night fire (bonus)", () => {
    expect(instruments.some((i) => i.detects.includes("nightFire"))).toBe(true);
  });

  it("has at least one instrument that fits only the small satellite", () => {
    expect(instruments.some((i) => i.fits.length === 1 && i.fits[0] === "smallsat")).toBe(true);
  });

  it("offers a narrow and a wide visible camera", () => {
    const fov = instruments.filter((i) => i.kind === "visible").map((i) => i.fieldOfViewDeg);
    expect(Math.min(...fov)).toBeLessThan(5);
    expect(Math.max(...fov)).toBeGreaterThan(60);
  });

  it("has 2–3 instruments at TRL 5–8, the rest at TRL 9", () => {
    const lower = instruments.filter((i) => i.trl >= 5 && i.trl <= 8).length;
    expect(lower).toBeGreaterThanOrEqual(2);
    expect(lower).toBeLessThanOrEqual(3);
    expect(instruments.filter((i) => i.trl === 9).length).toBe(instruments.length - lower);
  });

  it("marks every cost and science value as game-design", () => {
    for (const i of instruments) {
      const tagged = i.sources.filter((s) => s.fields.includes("costUsd") || s.fields.includes("scienceValue"));
      expect(tagged.map((s) => s.data_quality)).toEqual(["game-design"]);
    }
  });
});

describe("InstrumentSchema", () => {
  const first = instruments[0];
  if (!first) throw new Error("no instruments");

  it("rejects an instrument with a field left unsourced", () => {
    const sources = first.sources.map((s) => ({ ...s, fields: s.fields.filter((f) => f !== "powerW") }));
    expect(InstrumentSchema.safeParse({ ...first, sources }).success).toBe(false);
  });

  it("rejects an unknown detection", () => {
    expect(InstrumentSchema.safeParse({ ...first, detects: ["lightning"] }).success).toBe(false);
  });
});

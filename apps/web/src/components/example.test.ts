import { groundStations, instruments, launchers, parts } from "@space-mission/data";
import { WILDFIRE_WATCH, computeBudget, type Design } from "@space-mission/sim";
import { describe, expect, it } from "vitest";

const part = (id: string) => parts.find((p) => p.id === id)!;

describe("example design", () => {
  it("passes", () => {
    const design: Design = {
      parts: {
        structure: part("structure-12u-frame"),
        solar: part("solar-12u-deployable"),
        battery: part("battery-90wh"),
        obc: part("obc-rad-tolerant"),
        adcs: part("adcs-integrated-cubesat"),
        propulsion: part("propulsion-none"),
        comms: part("comms-xband-cubesat"),
      },
      instruments: ["swir-fire-cubesat", "vis-wide-cubesat"].map((id) => instruments.find((i) => i.id === id)!),
      launcher: launchers.find((l) => l.id === "rideshare"),
      groundStations: [groundStations.find((g) => g.id === "wallops")!],
    };
    const b = computeBudget(design, WILDFIRE_WATCH);
    expect(b.pass).toBe(true);
  });
});

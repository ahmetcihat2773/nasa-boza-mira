import { groundStations, instruments, launchers, parts } from "@space-mission/data";
import { WILDFIRE_WATCH, planEvents, runMission, type Design } from "@space-mission/sim";
import { afterEach, describe, expect, it, vi } from "vitest";
import { recordRun, useFlow } from "../flow.ts";
import { effectText, needsDecision } from "./Flow.tsx";

const part = (id: string) => parts.find((p) => p.id === id)!;
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

afterEach(() => vi.unstubAllGlobals());

describe("game flow", () => {
  it("plays a full run with decisions for every event that asks", () => {
    const decisions: Record<string, string> = {};
    for (const ev of planEvents(design, WILDFIRE_WATCH, 42)) {
      if (needsDecision(ev)) decisions[ev.event.id] = ev.available[ev.available.length - 1]!.id;
    }
    const r = runMission(design, WILDFIRE_WATCH, 42, decisions);
    expect(r.causes.length).toBeGreaterThan(0);
    expect(r.success ? r.score : r.failureReasons.length).toBeTruthy();
  });

  it("describes effects in plain words", () => {
    expect(effectText({ months: 4, costUsd: 400000 })).toBe("+4 months · +$0.40M");
    expect(effectText({})).toBe("no effect");
  });

  it("keeps the attempt when the API is offline", async () => {
    vi.stubGlobal("fetch", () => Promise.reject(new Error("offline")));
    useFlow.setState({ seed: 7, decisions: {}, attempts: [], remote: {}, nickname: "Tester" });
    recordRun(WILDFIRE_WATCH.id, design, runMission(design, WILDFIRE_WATCH, 7));
    const s = useFlow.getState();
    expect(s.attempts).toHaveLength(1);
    expect(s.phase).toBe("results");
    await vi.waitFor(() => expect(useFlow.getState().remote[1]).toBe("offline"));
  });
});

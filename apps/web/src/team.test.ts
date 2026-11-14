import { groundStations, instruments, launchers, parts } from "@space-mission/data";
import { WILDFIRE_WATCH, computeBudget, type Design } from "@space-mission/sim";
import { beforeEach, describe, expect, it } from "vitest";
import { adjustedMission, assignRoles, coordinationOf, knockOn, useTeam } from "./team.ts";

const part = (id: string) => parts.find((p) => p.id === id)!;
const design: Design = {
  parts: {
    structure: part("structure-12u-frame"),
    solar: part("solar-12u-body"),
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

beforeEach(() =>
  useTeam.getState().setTeam("team", [
    { nickname: "A", roles: ["launch", "ground"] },
    { nickname: "B", roles: ["spacecraft", "science"] },
  ]),
);

describe("team play", () => {
  it("deals the roles out so fewer players take more roles", () => {
    expect(assignRoles(2)).toEqual([
      ["launch", "ground"],
      ["spacecraft", "science"],
    ]);
    expect(assignRoles(4).every((r) => r.length === 1)).toBe(true);
  });

  it("budget requests need a majority of the other three roles and move allocation", () => {
    const t = useTeam.getState();
    t.openRequest({
      from: "science",
      to: "launch",
      kind: "budget",
      amount: 1e6,
      offerUsd: 0,
      note: "",
      byAdvisor: false,
    });
    t.vote(1, "launch", true);
    t.vote(1, "spacecraft", false);
    expect(useTeam.getState().requests[0]!.status).toBe("open");
    useTeam.getState().vote(1, "ground", true);
    const r = useTeam.getState().requests;
    expect(r[0]!.status).toBe("accepted");
    const m = adjustedMission(WILDFIRE_WATCH, r);
    const b = computeBudget(design, m);
    expect(b.allocationByRole.science).toBeCloseTo(7.5e6 + 1e6);
    expect(b.allocationByRole.launch).toBeCloseTo(10.5e6 - 1e6);
    expect(coordinationOf(r, b).requestsPaidOff).toBe(1);
  });

  it("previews the knock-on effect of a power request", () => {
    const lines = knockOn("power", 20, "science", "spacecraft", design, WILDFIRE_WATCH);
    expect(lines[0]).toMatch(/Spacecraft would fit/);
  });
});

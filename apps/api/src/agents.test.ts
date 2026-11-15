import { autoDesign, autopilotMission, templateDesign, toDesignIds } from "@space-mission/sim";
import { describe, expect, it } from "vitest";
import { parseJsonObject, runDesigner, runMonitor, type ClaudeFn } from "./agents.ts";
import { createApp } from "./app.ts";

const missing: ClaudeFn = () => Promise.reject(Object.assign(new Error("spawn claude ENOENT"), { code: "ENOENT" }));
const steps = autoDesign(templateDesign(), autopilotMission());
const goodIds = steps[steps.length - 1]!.ids;

describe("parseJsonObject", () => {
  it("finds the object with the wanted key inside prose and fences", () => {
    expect(parseJsonObject('Sure! ```json\n{"x":1}\n{"optionId":"a","t":"}"}\n```', "optionId")).toEqual({
      optionId: "a",
      t: "}",
    });
    expect(parseJsonObject("no json")).toBeNull();
  });
});

describe("Mission Designer", () => {
  it("falls back to the built-in designer when Claude is missing", async () => {
    const r = await runDesigner(missing);
    expect(r.source).toBe("autopilot");
    expect(r.fallbackReason).toBe("claude CLI not found");
    expect(r.pass).toBe(true);
  });

  it("feeds failed checks back to Claude and accepts its passing revision", async () => {
    const seen: unknown[] = [];
    const answers = [
      JSON.stringify({ reasoning: "Cheapest first.", design: toDesignIds(templateDesign()) }),
      JSON.stringify({ reasoning: "Added a thruster.", design: goodIds }),
    ];
    const claude: ClaudeFn = (_f, input) => {
      seen.push(input);
      return Promise.resolve(answers.shift()!);
    };
    const r = await runDesigner(claude);
    expect(r.source).toBe("claude");
    expect(r.pass).toBe(true);
    expect(r.steps.map((s) => s.pass)).toEqual([false, true]);
    expect(r.steps[1]!.reasoning).toBe("Added a thruster.");
    const second = seen[1] as { previousAttempts: { failedChecks: string[] }[] };
    expect(second.previousAttempts[0]!.failedChecks.join(" ")).toMatch(/C1 not met/);
  });

  it("repairs Claude's design with the built-in designer after the last failed attempt", async () => {
    const claude: ClaudeFn = () =>
      Promise.resolve(JSON.stringify({ reasoning: "x", design: toDesignIds(templateDesign()) }));
    const r = await runDesigner(claude);
    expect(r.source).toBe("claude+autopilot");
    expect(r.pass).toBe(true);
    expect(r.steps.slice(0, 3).every((s) => s.source === "claude")).toBe(true);
  });
});

describe("Mission Monitor", () => {
  it("uses Claude's diagnosis and feasible choice", async () => {
    const claude: ClaudeFn = () =>
      Promise.resolve('{"diagnosis":"Released 150 km low.","optionId":"raise-min","reasoning":"Saves fuel."}');
    const r = await runMonitor(goodIds, claude);
    if ("error" in r) throw new Error(r.error);
    expect(r.source).toBe("claude");
    expect(r.optionId).toBe("raise-min");
    expect(r.outcome.lifetimeMet).toBe(true);
  });

  it("ignores an infeasible choice and falls back to the rule", async () => {
    const claude: ClaudeFn = () => Promise.resolve('{"diagnosis":"d","optionId":"warp-drive","reasoning":"r"}');
    const r = await runMonitor(goodIds, claude);
    if ("error" in r) throw new Error(r.error);
    expect(r.source).toBe("autopilot");
    expect(r.optionId).toBe("raise-full");
  });

  it("serves both agents over HTTP", async () => {
    const app = createApp({ claude: missing });
    const d = (await (await app.request("/agents/designer", { method: "POST" })).json()) as { final: unknown };
    const res = await app.request("/agents/monitor", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ design: d.final }),
    });
    expect(res.status).toBe(200);
    const bad = await app.request("/agents/monitor", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ design: { parts: { solar: "nope" }, instruments: [] } }),
    });
    expect(bad.status).toBe(400);
  });
});

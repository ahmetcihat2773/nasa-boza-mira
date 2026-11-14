import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./app.ts";
import { openDb, type Db } from "./db/client.ts";

function sampleResult(overrides: Record<string, unknown> = {}) {
  return {
    seed: 42,
    success: true,
    failureReasons: [],
    score: {
      total: 640,
      stars: 2,
      components: [{ id: "science", weight: 40, value: 80, points: 320, explanation: "Good coverage." }],
    },
    causes: [
      { phase: "design", tone: "good", text: "The camera sees active fires." },
      { phase: "launch", tone: "bad", text: "The launch slipped two months." },
    ],
    realMission: { mission: { id: "firesat", name: "FireSat" }, reason: "Your design resembles FireSat." },
    budget: { totalUsd: 1 },
    ...overrides,
  };
}

const post = (app: ReturnType<typeof createApp>, path: string, body: unknown) =>
  app.request(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

describe("attempts and leaderboard", () => {
  let db: Db;
  let clock: number;
  let app: ReturnType<typeof createApp>;
  beforeEach(() => {
    db = openDb(":memory:");
    clock = Date.UTC(2026, 0, 1);
    app = createApp({ db, now: () => new Date((clock += 1000)) });
  });
  afterEach(() => db.$client.close());

  const save = (missionId: string, nick: string, total: number | null, seed = 42) =>
    post(app, "/attempts", {
      missionId,
      nicknames: [nick],
      seed,
      design: { parts: {} },
      result: sampleResult(
        total === null
          ? { seed, success: false, score: null, failureReasons: ["Out of power."] }
          : { seed, score: { total, stars: total >= 750 ? 3 : 2, components: [] } },
      ),
    });

  it("saves an attempt and returns it", async () => {
    const res = await save("wildfire", "  Ada ", 640);
    expect(res.status).toBe(201);
    const { attempt } = (await res.json()) as any;
    expect(attempt).toMatchObject({
      id: 1,
      missionId: "wildfire",
      nicknames: ["Ada"],
      seed: "42",
      success: true,
      score: 640,
      stars: 2,
    });
    expect(attempt.result.budget).toEqual({ totalUsd: 1 }); // unknown result fields are kept

    const one = await app.request(`/attempts/${attempt.id}`);
    expect(((await one.json()) as any).attempt.design).toEqual({ parts: {} });
  });

  it("rejects invalid bodies with issues", async () => {
    const res = await post(app, "/attempts", {
      missionId: "Wild Fire",
      nicknames: [],
      seed: 1,
      design: {},
      result: {},
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as any;
    expect(body.error).toBe("invalid body");
    expect(body.issues.length).toBeGreaterThan(0);

    const bad = await app.request("/attempts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });
    expect(bad.status).toBe(400);
  });

  it("rejects extra personal fields and a seed that does not match the result", async () => {
    const extra = await post(app, "/attempts", {
      missionId: "wildfire",
      nicknames: ["Ada"],
      email: "a@b.c",
      seed: 42,
      design: {},
      result: sampleResult(),
    });
    expect(extra.status).toBe(400);
    const mismatch = await post(app, "/attempts", {
      missionId: "wildfire",
      nicknames: ["Ada"],
      seed: 7,
      design: {},
      result: sampleResult(),
    });
    expect(mismatch.status).toBe(400);
  });

  it("lists recent attempts, newest first, filtered by mission", async () => {
    await save("wildfire", "A", 500);
    await save("flood", "B", 600);
    await save("wildfire", "C", null);
    const all = (await (await app.request("/attempts")).json()) as any;
    expect(all.attempts.map((a: { nicknames: string[] }) => a.nicknames[0])).toEqual(["C", "B", "A"]);
    const wf = (await (await app.request("/attempts?missionId=wildfire&limit=1")).json()) as any;
    expect(wf.attempts).toHaveLength(1);
    expect(wf.attempts[0]).toMatchObject({ nicknames: ["C"], success: false, score: 0, stars: 0 });
  });

  it("ranks successful attempts per mission by score, earlier first on ties", async () => {
    await save("wildfire", "Low", 500);
    await save("wildfire", "High", 800);
    await save("wildfire", "Tie", 500);
    await save("wildfire", "Failed", null);
    await save("flood", "Other", 999);
    const res = await app.request("/leaderboard/wildfire");
    const body = (await res.json()) as any;
    expect(body.missionId).toBe("wildfire");
    expect(body.entries.map((e: { rank: number; nicknames: string[] }) => [e.rank, e.nicknames[0]])).toEqual([
      [1, "High"],
      [2, "Low"],
      [3, "Tie"],
    ]);
    expect(body.entries[0].design).toBeUndefined();
  });

  it("answers 404 for a missing attempt and 503 without a database", async () => {
    expect((await app.request("/attempts/99")).status).toBe(404);
    expect((await createApp().request("/attempts")).status).toBe(503);
  });

  it("allows the Vite dev server by CORS", async () => {
    const res = await app.request("/attempts", {
      method: "OPTIONS",
      headers: { Origin: "http://localhost:5173", "Access-Control-Request-Method": "POST" },
    });
    expect(res.headers.get("access-control-allow-origin")).toBe("http://localhost:5173");
    const other = await app.request("/attempts", { headers: { Origin: "http://evil.example" } });
    expect(other.headers.get("access-control-allow-origin")).toBeNull();
  });
});

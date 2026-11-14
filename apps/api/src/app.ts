import { and, asc, desc, eq } from "drizzle-orm";
import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import type { z } from "zod";
import type { Db } from "./db/client.ts";
import { attempts } from "./db/schema.ts";
import { createFlightDirector, toDebriefInput, type Debrief, type FlightDirector } from "./flight-director.ts";
import { FlightDirectorRequestSchema, MissionIdSchema, SaveAttemptSchema, issuesOf } from "./schemas.ts";

/** The health answer: lets the web app (and people) check that the local API is up. */
export type HealthResponse = { status: "ok"; service: "api"; db: "ok" | "not-configured" };

/** A saved attempt as the API returns it. */
export type Attempt = {
  id: number;
  missionId: string;
  nicknames: string[];
  seed: string;
  success: boolean;
  score: number;
  stars: number;
  createdAt: string;
  design: unknown;
  result: unknown;
};
export type AttemptSummary = Omit<Attempt, "design" | "result">;
export type LeaderboardEntry = AttemptSummary & { rank: number };
export type FlightDirectorResponse = Debrief;

export type AppDeps = {
  db?: Db;
  flightDirector?: FlightDirector;
  /** Origins allowed by CORS; defaults to the Vite dev server. */
  corsOrigins?: string[];
  now?: () => Date;
};

export const DEFAULT_CORS_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173"];

type Row = typeof attempts.$inferSelect;
const summary = (r: Row): AttemptSummary => ({
  id: r.id,
  missionId: r.missionId,
  nicknames: r.nicknames,
  seed: r.seed,
  success: r.success,
  score: r.score,
  stars: r.stars,
  createdAt: r.createdAt.toISOString(),
});
const full = (r: Row): Attempt => ({ ...summary(r), design: r.design, result: r.result });

function limitParam(raw: string | undefined, fallback: number, max: number): number {
  const n = Number(raw ?? fallback);
  return Number.isInteger(n) && n > 0 ? Math.min(n, max) : fallback;
}

async function readJson<T extends z.ZodType>(
  c: Context,
  schema: T,
): Promise<{ ok: true; data: z.infer<T> } | { ok: false; res: Response }> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return { ok: false, res: c.json({ error: "body must be JSON" }, 400) };
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success)
    return { ok: false, res: c.json({ error: "invalid body", issues: issuesOf(parsed.error) }, 400) };
  return { ok: true, data: parsed.data };
}

/** Builds the HTTP app without starting a server, so tests can call it with `app.request()`. */
export function createApp({
  db,
  flightDirector = createFlightDirector(),
  corsOrigins = DEFAULT_CORS_ORIGINS,
  now = () => new Date(),
}: AppDeps = {}): Hono {
  const app = new Hono();

  app.use("*", cors({ origin: corsOrigins, allowMethods: ["GET", "POST", "OPTIONS"], allowHeaders: ["Content-Type"] }));
  app.use("*", bodyLimit({ maxSize: 512 * 1024, onError: (c) => c.json({ error: "body too large" }, 413) }));

  app.get("/health", (c) => {
    // A trivial query proves the SQLite file is open and readable.
    if (db) db.$client.prepare("select 1").get();
    return c.json<HealthResponse>({ status: "ok", service: "api", db: db ? "ok" : "not-configured" });
  });

  // ---------- Attempts and leaderboard (T21.2) ----------

  app.post("/attempts", async (c) => {
    if (!db) return c.json({ error: "database not configured" }, 503);
    const body = await readJson(c, SaveAttemptSchema);
    if (!body.ok) return body.res;
    const a = body.data;
    const row = db
      .insert(attempts)
      .values({
        missionId: a.missionId,
        nicknames: a.nicknames,
        seed: String(a.seed),
        design: a.design,
        result: a.result,
        success: a.result.success,
        score: a.result.success && a.result.score ? a.result.score.total : 0,
        stars: a.result.success && a.result.score ? a.result.score.stars : 0,
        createdAt: now(),
      })
      .returning()
      .get();
    return c.json({ attempt: full(row) }, 201);
  });

  app.get("/attempts", (c) => {
    if (!db) return c.json({ error: "database not configured" }, 503);
    const missionId = c.req.query("missionId");
    if (missionId !== undefined && !MissionIdSchema.safeParse(missionId).success)
      return c.json({ error: "invalid missionId" }, 400);
    const rows = db
      .select()
      .from(attempts)
      .where(missionId ? eq(attempts.missionId, missionId) : undefined)
      .orderBy(desc(attempts.createdAt), desc(attempts.id))
      .limit(limitParam(c.req.query("limit"), 20, 100))
      .all();
    return c.json({ attempts: rows.map(full) });
  });

  app.get("/attempts/:id", (c) => {
    if (!db) return c.json({ error: "database not configured" }, 503);
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id) || id <= 0) return c.json({ error: "invalid id" }, 400);
    const row = db.select().from(attempts).where(eq(attempts.id, id)).get();
    return row ? c.json({ attempt: full(row) }) : c.json({ error: "attempt not found" }, 404);
  });

  app.get("/leaderboard/:missionId", (c) => {
    if (!db) return c.json({ error: "database not configured" }, 503);
    const missionId = c.req.param("missionId");
    if (!MissionIdSchema.safeParse(missionId).success) return c.json({ error: "invalid missionId" }, 400);
    const rows = db
      .select()
      .from(attempts)
      .where(and(eq(attempts.missionId, missionId), eq(attempts.success, true)))
      .orderBy(desc(attempts.score), asc(attempts.createdAt), asc(attempts.id))
      .limit(limitParam(c.req.query("limit"), 10, 100))
      .all();
    const entries: LeaderboardEntry[] = rows.map((r, i) => ({ rank: i + 1, ...summary(r) }));
    return c.json({ missionId, entries });
  });

  // ---------- AI Flight Director (T22) ----------

  app.post("/flight-director", async (c) => {
    const body = await readJson(c, FlightDirectorRequestSchema);
    if (!body.ok) return body.res;
    return c.json<FlightDirectorResponse>(await flightDirector(toDebriefInput(body.data)));
  });

  return app;
}

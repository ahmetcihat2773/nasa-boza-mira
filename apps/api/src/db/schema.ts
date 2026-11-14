import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * Placeholder table so the migration pipeline works end to end.
 * Real tables (saved designs, runs, nickname leaderboard) replace or join it later.
 */
export const appMeta = sqliteTable("app_meta", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

/**
 * One finished mission run (T21.1). Only nicknames are stored, never other personal data.
 * `design` and `result` hold the JSON the web app sent; `score`/`stars` are copied out for the leaderboard.
 */
export const attempts = sqliteTable(
  "attempts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    missionId: text("mission_id").notNull(),
    /** JSON array of 1–4 nicknames. */
    nicknames: text("nicknames", { mode: "json" }).$type<string[]>().notNull(),
    /** The run seed, kept as text (the sim accepts numbers or strings). */
    seed: text("seed").notNull(),
    design: text("design", { mode: "json" }).$type<unknown>().notNull(),
    result: text("result", { mode: "json" }).$type<unknown>().notNull(),
    success: integer("success", { mode: "boolean" }).notNull(),
    /** 0–1000; 0 when the mission failed. */
    score: integer("score").notNull(),
    /** 1–3; 0 when the mission failed. */
    stars: integer("stars").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("attempts_mission_score_idx").on(t.missionId, t.score), index("attempts_created_idx").on(t.createdAt)],
);

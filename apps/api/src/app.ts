import { Hono } from "hono";
import type { Db } from "./db/client.ts";

/** The health answer: lets the web app (and people) check that the local API is up. */
export type HealthResponse = { status: "ok"; service: "api"; db: "ok" | "not-configured" };

export type AppDeps = { db?: Db };

/** Builds the HTTP app without starting a server, so tests can call it with `app.request()`. */
export function createApp({ db }: AppDeps = {}): Hono {
  const app = new Hono();

  app.get("/health", (c) => {
    // A trivial query proves the SQLite file is open and readable.
    if (db) db.$client.prepare("select 1").get();
    return c.json<HealthResponse>({ status: "ok", service: "api", db: db ? "ok" : "not-configured" });
  });

  return app;
}

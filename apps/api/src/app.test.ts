import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "./app.ts";
import { openDb, type Db } from "./db/client.ts";

describe("GET /health", () => {
  let db: Db | undefined;
  afterEach(() => db?.$client.close());

  it("answers 200 with status ok", async () => {
    const res = await createApp().request("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok", service: "api", db: "not-configured" });
  });

  it("reports the database when one is attached", async () => {
    db = openDb(":memory:");
    const res = await createApp({ db }).request("/health");
    expect(await res.json()).toEqual({ status: "ok", service: "api", db: "ok" });
  });

  it("answers 404 for unknown routes", async () => {
    const res = await createApp().request("/nope");
    expect(res.status).toBe(404);
  });
});

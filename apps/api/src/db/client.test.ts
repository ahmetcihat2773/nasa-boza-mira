import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "./client.ts";
import { appMeta } from "./schema.ts";

describe("SQLite database (in memory)", () => {
  let db: Db | undefined;
  afterEach(() => db?.$client.close());

  it("applies the migrations and round-trips a row", () => {
    db = openDb(":memory:");
    db.insert(appMeta).values({ key: "schema", value: "placeholder" }).run();

    const row = db.select().from(appMeta).where(eq(appMeta.key, "schema")).get();
    expect(row?.value).toBe("placeholder");
    expect(row?.updatedAt).toBeInstanceOf(Date);
  });

  it("records the applied migration", () => {
    db = openDb(":memory:");
    const applied = db.$client.prepare("select count(*) as n from __drizzle_migrations").get() as { n: number };
    expect(applied.n).toBeGreaterThan(0);
  });
});

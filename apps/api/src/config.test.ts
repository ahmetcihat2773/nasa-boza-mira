import { describe, expect, it } from "vitest";
import { readConfig } from "./config.ts";

describe("readConfig", () => {
  it("defaults to the loopback interface and port 8787", () => {
    expect(readConfig({})).toEqual({ host: "127.0.0.1", port: 8787 });
  });

  it("reads API_PORT", () => {
    expect(readConfig({ API_PORT: "9000" }).port).toBe(9000);
  });

  it("rejects an invalid API_PORT", () => {
    expect(() => readConfig({ API_PORT: "abc" })).toThrow(/API_PORT/);
  });
});

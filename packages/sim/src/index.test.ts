import { describe, expect, it } from "vitest";
import { PACKAGE_NAME } from "./index.ts";

describe("@space-mission/sim", () => {
  it("is wired into the workspace (placeholder test)", () => {
    expect(PACKAGE_NAME).toBe("@space-mission/sim");
  });
});

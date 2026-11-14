import { describe, expect, it } from "vitest";
import { PACKAGE_NAME } from "./index.ts";

describe("@space-mission/data", () => {
  it("is wired into the workspace (placeholder test)", () => {
    expect(PACKAGE_NAME).toBe("@space-mission/data");
  });
});

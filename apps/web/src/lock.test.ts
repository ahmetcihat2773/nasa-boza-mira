import { launchers, parts } from "@space-mission/data";
import { WILDFIRE_WATCH } from "@space-mission/sim";
import { describe, expect, it } from "vitest";
import { launcherLockReason, partLockReason } from "./lock.ts";

describe("lock reasons", () => {
  it("locks TRL 4 parts and over-budget launchers", () => {
    const low = parts.find((p) => p.trl <= 4);
    const sls = launchers.find((l) => l.launchCostUsd > WILDFIRE_WATCH.budgetUsd);
    expect(low && partLockReason(low)).toContain("TRL");
    expect(sls && launcherLockReason(sls, 10, WILDFIRE_WATCH)).toContain("budget");
  });
});

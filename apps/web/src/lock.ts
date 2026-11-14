import type { Launcher, Part, SpacecraftSize } from "@space-mission/data";
import { formatUsd, launchCostUsd, trlPenaltyMonths, type Mission } from "@space-mission/sim";

/** Why a part cannot be picked, or null when it can. */
export function partLockReason(part: Part): string | null {
  return trlPenaltyMonths(part.trl) === null ? `TRL ${part.trl}: still a lab prototype, not ready to fly.` : null;
}

export function partFits(part: Part, size: SpacecraftSize | undefined): boolean {
  return size !== undefined && part.fits.includes(size);
}

/** Why a launcher cannot be picked, or null when it can. */
export function launcherLockReason(launcher: Launcher, massKg: number, mission: Mission): string | null {
  const cost = launchCostUsd(launcher, massKg);
  return cost > mission.budgetUsd
    ? `Costs ${formatUsd(cost)}, more than the whole ${formatUsd(mission.budgetUsd)} budget.`
    : null;
}

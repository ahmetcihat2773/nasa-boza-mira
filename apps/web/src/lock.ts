import type { Launcher, SpacecraftSize } from "@space-mission/data";
import { formatUsd, launchCostUsd, trlPenaltyMonths, type Mission } from "@space-mission/sim";

/** Why a part or instrument cannot be picked (too immature), or null when it can. */
export function partLockReason(item: { trl: number }): string | null {
  return trlPenaltyMonths(item.trl) === null ? `TRL ${item.trl}: still a lab prototype, not ready to fly.` : null;
}

/** Same rule for instruments. */
export const instrumentLockReason = partLockReason;

export function partFits(part: { fits: readonly SpacecraftSize[] }, size: SpacecraftSize | undefined): boolean {
  return size !== undefined && part.fits.includes(size);
}

/** Why a launcher cannot be picked, or null when it can. */
export function launcherLockReason(launcher: Launcher, massKg: number, mission: Mission): string | null {
  const cost = launchCostUsd(launcher, massKg);
  return cost > mission.budgetUsd
    ? `Costs ${formatUsd(cost)}, more than the whole ${formatUsd(mission.budgetUsd)} budget.`
    : null;
}

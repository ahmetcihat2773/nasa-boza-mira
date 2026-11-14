import type { Launcher, Part, SpacecraftSize } from "@space-mission/data";
import { destinationOf } from "./missions.ts";
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

/** Why a part cannot be used on this mission (size or propulsion rules of the card), or null when it can. */
export function missionPartLockReason(part: Part, mission: Mission): string | null {
  const sizes = mission.card.constraints.sizes;
  if (part.subsystem === "structure") {
    const size = part.fits[0];
    if (size && !sizes.includes(size))
      return `A ${size} is too small for ${mission.name}: it cannot carry the fuel, radio and instruments the mission needs. Pick ${sizes.join(" or ")}.`;
  }
  if (part.subsystem === "propulsion" && destinationOf(mission.card) === "lunar-orbit" && part.id === "propulsion-none")
    return "The launcher only sends the spacecraft towards the Moon; it must brake into lunar orbit itself and hold its orbit for a year. Pick a thruster.";
  return null;
}

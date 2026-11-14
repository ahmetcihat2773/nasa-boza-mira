/**
 * The playable missions (design.md section 10.5): one entry per mission card, with the sim's Mission.
 * The rules stay in @space-mission/sim; this file only looks missions up by id.
 */
import { missionCards, type Destination, type MissionCard } from "@space-mission/data";
import { WILDFIRE_WATCH, missionFromCard, type Budget, type Mission } from "@space-mission/sim";

export type { Destination };

export interface PlayableMission {
  id: string;
  card: MissionCard;
  mission: Mission;
}

export const MISSIONS: readonly PlayableMission[] = missionCards.map((card) => ({
  id: card.id,
  card,
  mission: card.id === WILDFIRE_WATCH.id ? WILDFIRE_WATCH : missionFromCard(card),
}));

export const DEFAULT_MISSION_ID = WILDFIRE_WATCH.id;

/** The mission with this id, or Wildfire Watch when it is unknown. */
export function missionById(id: string): Mission {
  return MISSIONS.find((m) => m.id === id)?.mission ?? WILDFIRE_WATCH;
}

/** Where the mission flies, from the card. */
export const destinationOf = (card: MissionCard): Destination => card.destination;

export const DESTINATION_LABEL: Record<Destination, string> = {
  "earth-orbit": "Earth orbit",
  "lunar-orbit": "Polar orbit around the Moon",
};

export const DIFFICULTY_LABEL: Record<MissionCard["difficulty"], string> = {
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
  expert: "Expert",
};

/** The transfer numbers the dashboard shows for a Moon mission (null in Earth orbit). */
export interface TransferMeters {
  /** Delta-v the spacecraft must provide (insertion + station-keeping for the mission life), km/s. */
  neededKmS: number;
  /** Delta-v the chosen propulsion can give with its propellant, km/s. */
  availableKmS: number;
  propellantKg: number;
}

/**
 * Reads the sim's transfer results off the budget. The sim computes them (T26.2); this only picks the
 * fields up, so the dashboard shows nothing until the sim provides them.
 */
export function transferMeters(b: Budget): TransferMeters | null {
  const t = (b as { transfer?: Partial<Record<string, number>> | null }).transfer;
  if (!t) return null;
  const needed = t.deltaVNeededKmS ?? t.neededKmS ?? t.totalDeltaVKmS;
  const available = t.deltaVAvailableKmS ?? t.availableKmS;
  const propellant = t.propellantKg ?? t.propellantMassKg;
  if (needed === undefined || available === undefined || propellant === undefined) return null;
  return { neededKmS: needed, availableKmS: available, propellantKg: propellant };
}

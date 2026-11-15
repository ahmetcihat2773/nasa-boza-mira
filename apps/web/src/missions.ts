/**
 * The playable missions (design.md section 10.5): one entry per mission card, with the sim's Mission.
 * The rules stay in @space-mission/sim; this file only looks missions up by id.
 */
import {
  allLaunchers,
  instruments,
  missionCards,
  parts,
  type Destination,
  type Instrument,
  type Launcher,
  type MissionCard,
  type Part,
} from "@space-mission/data";
import { WILDFIRE_WATCH, missionFromCard, type Budget, type Design, type Mission } from "@space-mission/sim";

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
 * Reads the sim's delta-v budget (computeBudget().deltaV, lunar missions only);
 * null in Earth orbit, so the dashboard shows the transfer meters only at the Moon.
 */
export function transferMeters(b: Budget): TransferMeters | null {
  const d = b.deltaV;
  if (!d) return null;
  return { neededKmS: d.neededKmS, availableKmS: d.availableKmS, propellantKg: d.propellantKg };
}

const partById = (id: string): Part => {
  const p = parts.find((x) => x.id === id);
  if (!p) throw new Error(`starter design: no part ${id}`);
  return p;
};
const instrumentsById = (ids: readonly string[]): Instrument[] => instruments.filter((i) => ids.includes(i.id));
const launcherById = (id: string): Launcher => {
  const l = allLaunchers.find((x) => x.id === id);
  if (!l) throw new Error(`starter design: no launcher ${id}`);
  return l;
};

/**
 * A ready-to-fly design for the mission, so the Concept phase starts from a working
 * configuration instead of an empty bus. Both starters pass computeBudget; the player
 * is free to swap any part from there.
 */
export function starterDesign(mission: Mission): Design {
  if (mission.destination === "lunar-orbit") {
    return {
      parts: {
        structure: partById("structure-smallsat-composite"),
        solar: partById("solar-smallsat-deployable"),
        battery: partById("battery-600wh"),
        obc: partById("obc-rad-tolerant"),
        adcs: partById("adcs-wheels-smallsat"),
        propulsion: partById("propulsion-biprop-lunar"),
        comms: partById("comms-xband-smallsat"),
      },
      instruments: instrumentsById(["neutron-spectrometer", "mini-radar-ice"]),
      launcher: launcherById("lunar-rideshare"),
      orbit: { type: "polar", altitudeKm: 100 },
    };
  }
  return {
    parts: {
      structure: partById("structure-12u-frame"),
      solar: partById("solar-12u-deployable"),
      battery: partById("battery-90wh"),
      obc: partById("obc-microcontroller"),
      adcs: partById("adcs-integrated-cubesat"),
      propulsion: partById("propulsion-none"),
      comms: partById("comms-xband-cubesat"),
    },
    instruments: instrumentsById(["swir-fire-cubesat", "vis-wide-cubesat"]),
    launcher: launcherById("rideshare"),
  };
}

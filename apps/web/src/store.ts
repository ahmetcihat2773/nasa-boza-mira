import type { GroundStation, Instrument, Launcher, Part, Subsystem } from "@space-mission/data";
import type { Design, OrbitChoice } from "@space-mission/sim";
import { create } from "zustand";

interface GameState {
  design: Design;
  launched: boolean;
  pickPart: (subsystem: Subsystem, part: Part | undefined) => void;
  pickLauncher: (launcher: Launcher | undefined) => void;
  /** Adds the instrument, or removes it when already chosen. */
  toggleInstrument: (instrument: Instrument) => void;
  setOrbit: (orbit: OrbitChoice) => void;
  setGroundStations: (stations: GroundStation[]) => void;
  launch: () => void;
  reset: () => void;
}

export const useGame = create<GameState>((set) => ({
  design: { parts: {} },
  launched: false,
  pickPart: (subsystem, part) =>
    set((s) => {
      const parts = { ...s.design.parts, [subsystem]: part };
      let instruments = s.design.instruments;
      // A new structure sets a new size, so drop parts and instruments that no longer fit.
      if (subsystem === "structure") {
        const size = part?.fits[0];
        for (const [k, p] of Object.entries(parts)) {
          if (k !== "structure" && p && (!size || !p.fits.includes(size))) delete parts[k as Subsystem];
        }
        instruments = instruments?.filter((i) => size !== undefined && i.fits.includes(size));
      }
      return { design: { ...s.design, parts, instruments }, launched: false };
    }),
  pickLauncher: (launcher) =>
    set((s) => {
      // A rideshare decides the orbit, so drop the player's own orbit choice.
      const orbit = launcher?.fixedOrbit ? undefined : s.design.orbit;
      return { design: { ...s.design, launcher, orbit }, launched: false };
    }),
  toggleInstrument: (instrument) =>
    set((s) => {
      const current = s.design.instruments ?? [];
      const instruments = current.some((i) => i.id === instrument.id)
        ? current.filter((i) => i.id !== instrument.id)
        : [...current, instrument];
      return { design: { ...s.design, instruments }, launched: false };
    }),
  setOrbit: (orbit) => set((s) => ({ design: { ...s.design, orbit }, launched: false })),
  setGroundStations: (groundStations) => set((s) => ({ design: { ...s.design, groundStations }, launched: false })),
  launch: () => set({ launched: true }),
  reset: () => set({ design: { parts: {} }, launched: false }),
}));

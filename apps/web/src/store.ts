import type { Launcher, Part, Subsystem } from "@space-mission/data";
import type { Design } from "@space-mission/sim";
import { create } from "zustand";

interface GameState {
  design: Design;
  launched: boolean;
  pickPart: (subsystem: Subsystem, part: Part | undefined) => void;
  pickLauncher: (launcher: Launcher | undefined) => void;
  launch: () => void;
  reset: () => void;
}

export const useGame = create<GameState>((set) => ({
  design: { parts: {} },
  launched: false,
  pickPart: (subsystem, part) =>
    set((s) => {
      const parts = { ...s.design.parts, [subsystem]: part };
      // A new structure sets a new size, so drop parts that no longer fit.
      if (subsystem === "structure") {
        const size = part?.fits[0];
        for (const [k, p] of Object.entries(parts)) {
          if (k !== "structure" && p && (!size || !p.fits.includes(size))) delete parts[k as Subsystem];
        }
      }
      return { design: { ...s.design, parts }, launched: false };
    }),
  pickLauncher: (launcher) => set((s) => ({ design: { ...s.design, launcher }, launched: false })),
  launch: () => set({ launched: true }),
  reset: () => set({ design: { parts: {} }, launched: false }),
}));

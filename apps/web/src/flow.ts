import type { Design, MissionResult } from "@space-mission/sim";
import { create } from "zustand";
import { postAttempt } from "./api.ts";
import { DEFAULT_MISSION_ID, missionById, starterDesign } from "./missions.ts";
import { useGame } from "./store.ts";
import { useTeam } from "./team.ts";

/** The game phases of design.md section 7. Concept and Trade-offs share the design screen. */
export type Phase =
  "setup" | "mission" | "briefing" | "design" | "approval" | "development" | "launch" | "operations" | "results";

export const PHASE_STEPS: { label: string; phase: Phase }[] = [
  { label: "Setup", phase: "setup" },
  { label: "Mission", phase: "mission" },
  { label: "Briefing", phase: "briefing" },
  { label: "Concept", phase: "design" },
  { label: "Trade-offs", phase: "design" },
  { label: "Design approval", phase: "approval" },
  { label: "Development", phase: "development" },
  { label: "Launch", phase: "launch" },
  { label: "Operations", phase: "operations" },
  { label: "Results", phase: "results" },
];

/** One finished run, kept for retry and comparison (saved to the API later). */
export interface Attempt {
  number: number;
  /** The mission card this attempt flew. */
  missionId: string;
  nickname: string;
  seed: number;
  design: Design;
  decisions: Record<string, string>;
  result: MissionResult;
}

export const newSeed = (): number => Math.floor(Math.random() * 1_000_000);

interface FlowState {
  phase: Phase;
  mode: "solo";
  nickname: string;
  /** The chosen mission card (design.md section 10.5). */
  missionId: string;
  seed: number;
  /** Event id → option id, chosen by the deciding role. */
  decisions: Record<string, string>;
  attempts: Attempt[];
  /** API save status per attempt number: the saved id, "saving", or "offline" when the API is not reachable. */
  remote: Record<number, number | "saving" | "offline">;
  setRemote: (attemptNumber: number, status: number | "saving" | "offline") => void;
  start: (nickname: string) => void;
  /** Picks the mission and opens its briefing. */
  chooseMission: (missionId: string) => void;
  goTo: (phase: Phase) => void;
  decide: (eventId: string, optionId: string) => void;
  /** Keeps the attempt in the store and returns it with its number. */
  saveAttempt: (attempt: Omit<Attempt, "number" | "nickname" | "missionId">) => Attempt;
  /** Back to the design screen with the same seed: the same events happen again. */
  retrySameSeed: () => void;
  /** Back to the design screen with a new seed: different events. */
  newAttempt: () => void;
}

export const useFlow = create<FlowState>((set, get) => ({
  phase: "setup",
  mode: "solo",
  nickname: "",
  missionId: DEFAULT_MISSION_ID,
  seed: newSeed(),
  decisions: {},
  attempts: [],
  remote: {},
  setRemote: (n, status) => set((s) => ({ remote: { ...s.remote, [n]: status } })),
  start: (nickname) => set({ nickname: nickname.trim() || "Player", phase: "mission" }),
  chooseMission: (missionId) => {
    // A new mission starts from its starter design: parts, orbit and requests belong to the old one.
    if (missionId !== get().missionId) {
      useGame.getState().reset(starterDesign(missionById(missionId)));
      useTeam.setState({ requests: [] });
    }
    set({ missionId, phase: "briefing", decisions: {}, seed: newSeed() });
  },
  goTo: (phase) => set({ phase }),
  decide: (eventId, optionId) => set((s) => ({ decisions: { ...s.decisions, [eventId]: optionId } })),
  saveAttempt: (a) => {
    const attempt: Attempt = {
      ...a,
      number: get().attempts.length + 1,
      nickname: get().nickname,
      missionId: get().missionId,
    };
    set((s) => ({ attempts: [...s.attempts, attempt] }));
    return attempt;
  },
  retrySameSeed: () => set({ phase: "design", decisions: {} }),
  newAttempt: () => set({ phase: "design", decisions: {}, seed: newSeed() }),
}));

/** Ends a run: keeps the attempt, saves it to the local API in the background, and shows the results. */
export function recordRun(missionId: string, design: Design, result: MissionResult): void {
  const s = useFlow.getState();
  const attempt = s.saveAttempt({ seed: s.seed, design, decisions: s.decisions, result });
  s.setRemote(attempt.number, "saving");
  const nicknames = useTeam.getState().players.map((p) => p.nickname);
  void postAttempt({ missionId, nicknames, seed: attempt.seed, design, result }).then((saved) =>
    useFlow.getState().setRemote(attempt.number, saved ? saved.id : "offline"),
  );
  s.goTo("results");
}

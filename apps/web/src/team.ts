/**
 * Team play (T20): players and their roles, hot-seat turns, and requests/trades between roles (design.md sections 2–3).
 * The rules of budgets, mass and power stay in @space-mission/sim; this file only keeps track of who agreed to what.
 */
import { launchers, parts } from "@space-mission/data";
import {
  computeBudget,
  launchCostUsd,
  launcherCapacityKg,
  trlPenaltyMonths,
  type Budget,
  type BudgetRole,
  type Coordination,
  type Design,
  type Mission,
} from "@space-mission/sim";
import { create } from "zustand";

export const ROLE_ORDER: readonly BudgetRole[] = ["launch", "spacecraft", "ground", "science"];
export const ROLE_LABEL: Record<BudgetRole, string> = {
  launch: "Launch",
  spacecraft: "Spacecraft",
  ground: "Ground",
  science: "Science",
};

export interface Player {
  nickname: string;
  roles: BudgetRole[];
}

/** Default role assignment: the four roles dealt out in turn, so fewer players take more roles. */
export function assignRoles(playerCount: number): BudgetRole[][] {
  const out: BudgetRole[][] = Array.from({ length: playerCount }, () => []);
  ROLE_ORDER.forEach((r, i) => out[i % playerCount]!.push(r));
  return out;
}

export type RequestKind = "budget" | "power" | "mass";
/** Who provides mass and power (design.md section 3.1). */
export const PROVIDER: Record<Exclude<RequestKind, "budget">, BudgetRole> = { power: "spacecraft", mass: "launch" };
export const UNIT: Record<RequestKind, string> = { budget: "$M", power: "W", mass: "kg" };

export interface TeamRequest {
  id: number;
  from: BudgetRole;
  /** The role that gives the budget, or the provider of mass/power. */
  to: BudgetRole;
  kind: RequestKind;
  /** USD for budget, W for power, kg for mass. */
  amount: number;
  /** A trade: budget the requester gives to the provider in return (USD, 0 = plain request). */
  offerUsd: number;
  note: string;
  byAdvisor: boolean;
  status: "open" | "accepted" | "rejected";
  votes: Partial<Record<BudgetRole, boolean>>;
}

/** Budget requests are voted by the other three roles; mass and power requests are answered by the provider. */
export function votersOf(r: Pick<TeamRequest, "kind" | "from" | "to">): BudgetRole[] {
  return r.kind === "budget" ? ROLE_ORDER.filter((x) => x !== r.from) : [r.to];
}

interface TeamState {
  mode: "solo" | "team";
  players: Player[];
  /** Index into ROLE_ORDER of the role whose turn it is (team mode). */
  turn: number;
  requests: TeamRequest[];
  setTeam: (mode: "solo" | "team", players: Player[]) => void;
  endTurn: () => void;
  openRequest: (r: Omit<TeamRequest, "id" | "status" | "votes">) => void;
  vote: (id: number, role: BudgetRole, yes: boolean) => void;
}

export const useTeam = create<TeamState>((set) => ({
  mode: "solo",
  players: [{ nickname: "Player", roles: [...ROLE_ORDER] }],
  turn: 0,
  requests: [],
  setTeam: (mode, players) => set({ mode, players, turn: 0, requests: [] }),
  endTurn: () => set((s) => ({ turn: (s.turn + 1) % ROLE_ORDER.length })),
  openRequest: (r) =>
    set((s) => ({ requests: [...s.requests, { ...r, id: s.requests.length + 1, status: "open", votes: {} }] })),
  vote: (id, role, yes) =>
    set((s) => ({
      requests: s.requests.map((r) => {
        if (r.id !== id || r.status !== "open") return r;
        const votes = { ...r.votes, [role]: yes };
        const voters = votersOf(r);
        if (!voters.every((v) => votes[v] !== undefined)) return { ...r, votes };
        const yesCount = voters.filter((v) => votes[v]).length;
        return { ...r, votes, status: yesCount * 2 > voters.length ? "accepted" : "rejected" };
      }),
    })),
}));

/** The player who plays a role. */
export function ownerOf(players: readonly Player[], role: BudgetRole | null | undefined): Player | undefined {
  return players.find((p) => role && p.roles.includes(role));
}

/** Budget moved between roles by accepted requests and trades, in USD (positive = received). */
export function transfers(requests: readonly TeamRequest[]): Record<BudgetRole, number> {
  const t: Record<BudgetRole, number> = { launch: 0, spacecraft: 0, ground: 0, science: 0 };
  for (const r of requests) {
    if (r.status !== "accepted") continue;
    if (r.kind === "budget") {
      t[r.from] += r.amount;
      t[r.to] -= r.amount;
    } else if (r.offerUsd > 0) {
      t[r.from] -= r.offerUsd;
      t[r.to] += r.offerUsd;
    }
  }
  return t;
}

/** The mission with the budget allocations after accepted requests and trades. */
export function adjustedMission(base: Mission, requests: readonly TeamRequest[]): Mission {
  const t = transfers(requests);
  if (ROLE_ORDER.every((r) => t[r] === 0)) return base;
  const pct = { ...base.allocationsPct };
  for (const r of ROLE_ORDER) pct[r] += (t[r] / base.budgetUsd) * 100;
  return { ...base, allocationsPct: pct };
}

const ok = (b: Budget, ...ids: string[]) => ids.every((id) => b.checks.find((c) => c.id === id)?.ok !== false);

/** Did the thing asked for get used? Budget: the requester ends within its allocation; power/mass: the design has enough. */
function paidOff(r: TeamRequest, b: Budget): boolean {
  if (r.kind === "budget") return b.spendByRole[r.from] <= b.allocationByRole[r.from];
  return r.kind === "power" ? ok(b, "power", "power-orbit") : ok(b, "mass-launcher", "mass-structure");
}

/** Coordination inputs for runMission (design.md section 3.5). */
export function coordinationOf(requests: readonly TeamRequest[], b: Budget): Coordination {
  const accepted = requests.filter((r) => r.status === "accepted");
  const trades = accepted.filter((r) => r.kind !== "budget" && r.offerUsd > 0);
  return {
    requestsPaidOff: accepted.filter((r) => !trades.includes(r) && paidOff(r, b)).length,
    tradesHelped: trades.filter(
      (r) =>
        paidOff(r, b) &&
        b.spendByRole[r.from] <= b.allocationByRole[r.from] &&
        b.spendByRole[r.to] <= b.allocationByRole[r.to],
    ).length,
  };
}

/** The knock-on effect of a request, worked out with the sim on a changed copy of the design. */
export function knockOn(
  kind: RequestKind,
  amount: number,
  from: BudgetRole,
  to: BudgetRole,
  design: Design,
  mission: Mission,
): string[] {
  const b = computeBudget(design, mission);
  const usd = (x: number) => `$${(x / 1e6).toFixed(2)}M`;
  if (!(amount > 0)) return ["Enter an amount to see the effect."];

  if (kind === "budget") {
    const giverLeft = b.allocationByRole[to] - amount - b.spendByRole[to];
    return [
      `${ROLE_LABEL[from]} allocation: ${usd(b.allocationByRole[from])} → ${usd(b.allocationByRole[from] + amount)}.`,
      `${ROLE_LABEL[to]} allocation: ${usd(b.allocationByRole[to])} → ${usd(b.allocationByRole[to] - amount)}${giverLeft < 0 ? `, which leaves ${ROLE_LABEL[to]} ${usd(-giverLeft)} over its allocation` : ""}.`,
    ];
  }

  const size = design.parts.structure?.fits[0];
  if (kind === "power") {
    const target = b.powerDrawnW + amount;
    const options = parts
      .filter((p) => p.subsystem === "solar" && size && p.fits.includes(size) && trlPenaltyMonths(p.trl) !== null)
      .filter((p) => (p.powerProducedW ?? 0) >= target)
      .sort((x, y) => x.costUsd - y.costUsd);
    const pick = options[0];
    if (!pick)
      return [
        `No solar panel for this spacecraft size gives ${target.toFixed(0)} W. A bigger structure would be needed.`,
      ];
    const b2 = computeBudget({ ...design, parts: { ...design.parts, solar: pick } }, mission);
    const lines = [
      `Spacecraft would fit ${pick.name} (${pick.powerProducedW} W): ${b2.massKg - b.massKg >= 0 ? "+" : ""}${(b2.massKg - b.massKg).toFixed(1)} kg, ${usd(b2.costByRole.spacecraft - b.costByRole.spacecraft)} from the Spacecraft budget.`,
    ];
    if (b2.launcherCapacityKg !== null && b2.massKg > b2.launcherCapacityKg)
      lines.push(
        `Knock-on: ${b2.massKg.toFixed(1)} kg is over the launcher's ${b2.launcherCapacityKg} kg, so Launch would need a bigger rocket.`,
      );
    if (b2.maxMassKg !== null && b2.massKg > b2.maxMassKg)
      lines.push(`Knock-on: over the structure limit of ${b2.maxMassKg} kg.`);
    return lines;
  }

  const target = b.massKg + amount;
  const options = launchers
    .filter((l) => launcherCapacityKg(l, b.orbit.type) >= target && launchCostUsd(l, target) <= mission.budgetUsd)
    .sort((x, y) => launchCostUsd(x, target) - launchCostUsd(y, target));
  const pick = options[0];
  const lines: string[] = [];
  if (!pick) lines.push(`No affordable launcher lifts ${target.toFixed(1)} kg to this orbit.`);
  else if (pick.id === design.launcher?.id)
    lines.push(`The ${pick.name} can already lift ${target.toFixed(1)} kg: no change needed.`);
  else {
    const b2 = computeBudget({ ...design, launcher: pick }, mission);
    lines.push(
      `Launch would switch to the ${pick.name}: ${usd(b2.costByRole.launch - b.costByRole.launch)} from the Launch budget.`,
    );
    if (pick.fixedOrbit) lines.push(`Its orbit is fixed at ${pick.fixedOrbit.altitudeKm} km ${pick.fixedOrbit.type}.`);
  }
  if (b.maxMassKg !== null && target > b.maxMassKg)
    lines.push(
      `Knock-on: ${target.toFixed(1)} kg is over the structure limit of ${b.maxMassKg} kg; Spacecraft needs a bigger structure.`,
    );
  return lines;
}

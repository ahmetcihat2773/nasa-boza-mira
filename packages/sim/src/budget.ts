import type { Launcher, Part, SpacecraftSize, Subsystem } from "@space-mission/data";

/** The roles that share the mission budget. */
export type BudgetRole = "launch" | "spacecraft" | "science" | "ground";

export interface Mission {
  id: string;
  name: string;
  objective: string;
  budgetUsd: number;
  /** Share of the budget for each role, in percent (sums to 100). */
  allocationsPct: Record<BudgetRole, number>;
  deadlineMonths: number;
}

/** Wildfire Watch, hard-coded until missions move into @space-mission/data. */
export const WILDFIRE_WATCH: Mission = {
  id: "wildfire-watch",
  name: "Wildfire Watch",
  objective: "Detect new wildfires from a sun-synchronous orbit and send alerts to the ground within hours.",
  budgetUsd: 30_000_000,
  allocationsPct: { launch: 35, spacecraft: 30, science: 25, ground: 10 },
  deadlineMonths: 30,
};

/** A design: one part per subsystem (missing subsystems are allowed while building) and a launcher. */
export interface Design {
  parts: Partial<Record<Subsystem, Part>>;
  launcher?: Launcher;
}

export const SUBSYSTEMS: readonly Subsystem[] = ["structure", "solar", "battery", "obc", "adcs", "propulsion", "comms"];
export const TEAM_COST_PER_MONTH_USD = 200_000;
export const BASE_DEV_MONTHS: Record<SpacecraftSize, number> = { "6U": 15, "12U": 15, smallsat: 24 };

/** Extra development months for a part's TRL; null means the part is locked (too immature to fly). */
export function trlPenaltyMonths(trl: number): number | null {
  if (trl <= 4) return null;
  if (trl <= 6) return 9;
  if (trl <= 8) return 3;
  return 0;
}

/** Launch price for a spacecraft of the given mass. Rideshare: fixed price up to includedKg, then per kg. */
export function launchCostUsd(launcher: Launcher, massKg: number): number {
  if (launcher.costPerKgUsd !== undefined && launcher.includedKg !== undefined) {
    return launcher.launchCostUsd + Math.max(0, massKg - launcher.includedKg) * launcher.costPerKgUsd;
  }
  return launcher.launchCostUsd;
}

/** Maximum spacecraft mass a structure allows (its performance value, in kg). */
export function structureMaxMassKg(structure: Part): number {
  return structure.performance.value;
}

export type CheckId = "incomplete" | "locked" | "mass-structure" | "mass-launcher" | "power" | "budget" | "schedule";

export interface Check {
  id: CheckId;
  ok: boolean;
  message: string;
}

export interface Budget {
  massKg: number;
  maxMassKg: number | null;
  launcherCapacityKg: number | null;
  powerDrawnW: number;
  powerProducedW: number;
  costByRole: Record<BudgetRole, number>;
  allocationByRole: Record<BudgetRole, number>;
  teamCostUsd: number;
  totalCostUsd: number;
  devMonths: number;
  checks: Check[];
  pass: boolean;
}

export const formatUsd = (usd: number): string => `$${(usd / 1e6).toFixed(2)}M`;

export function computeBudget(design: Design, mission: Mission): Budget {
  const chosen = Object.values(design.parts).filter((p): p is Part => p !== undefined);
  const massKg = chosen.reduce((s, p) => s + p.massKg, 0);
  const powerDrawnW = chosen.reduce((s, p) => s + p.powerW, 0);
  const powerProducedW = chosen.reduce((s, p) => s + (p.powerProducedW ?? 0), 0);

  const costByRole: Record<BudgetRole, number> = { launch: 0, spacecraft: 0, science: 0, ground: 0 };
  for (const p of chosen) costByRole[p.role] += p.costUsd;
  if (design.launcher) costByRole.launch = launchCostUsd(design.launcher, massKg);

  const structure = design.parts.structure;
  const size = structure?.fits[0];
  const lockedParts = chosen.filter((p) => trlPenaltyMonths(p.trl) === null);
  const worstPenalty = Math.max(0, ...chosen.map((p) => trlPenaltyMonths(p.trl) ?? 0));
  const devMonths = (size ? BASE_DEV_MONTHS[size] : 0) + worstPenalty;
  const teamCostUsd = devMonths * TEAM_COST_PER_MONTH_USD;
  const totalCostUsd = Object.values(costByRole).reduce((s, c) => s + c, 0) + teamCostUsd;

  const pct = mission.allocationsPct;
  const share = (p: number) => (mission.budgetUsd * p) / 100;
  const allocationByRole: Record<BudgetRole, number> = {
    launch: share(pct.launch),
    spacecraft: share(pct.spacecraft),
    science: share(pct.science),
    ground: share(pct.ground),
  };

  const maxMassKg = structure ? structureMaxMassKg(structure) : null;
  const launcherCapacityKg = design.launcher?.ssoCapacityKg ?? null;
  const missing: string[] = SUBSYSTEMS.filter((s) => !design.parts[s]);
  if (!design.launcher) missing.push("launcher");
  const powerOk = powerProducedW > 0 && powerProducedW >= powerDrawnW;
  const kg = massKg.toFixed(1);

  const checks: Check[] = [
    {
      id: "incomplete",
      ok: missing.length === 0,
      message: missing.length === 0 ? "Every subsystem and a launcher are chosen." : `Still missing: ${missing.join(", ")}.`,
    },
    {
      id: "locked",
      ok: lockedParts.length === 0,
      message:
        lockedParts.length === 0
          ? "All parts are mature enough to fly (TRL 5 or higher)."
          : `Too immature to fly (TRL 4 or lower): ${lockedParts.map((p) => p.name).join(", ")}.`,
    },
    {
      id: "mass-structure",
      ok: maxMassKg !== null && massKg <= maxMassKg,
      message:
        maxMassKg === null
          ? "No structure chosen, so the spacecraft has no mass limit yet."
          : `Spacecraft mass ${kg} kg ${massKg <= maxMassKg ? "fits within" : "is over"} the structure limit of ${maxMassKg} kg.`,
    },
    {
      id: "mass-launcher",
      ok: launcherCapacityKg !== null && massKg <= launcherCapacityKg,
      message:
        launcherCapacityKg === null
          ? "No launcher chosen."
          : `Spacecraft mass ${kg} kg ${massKg <= launcherCapacityKg ? "fits within" : "is over"} the launcher's sun-synchronous capacity of ${launcherCapacityKg} kg.`,
    },
    {
      id: "power",
      ok: powerOk,
      message: `Solar panels produce ${powerProducedW} W and the parts draw ${powerDrawnW.toFixed(1)} W${powerOk ? "." : ": not enough power."}`,
    },
    {
      id: "budget",
      ok: totalCostUsd <= mission.budgetUsd,
      message: `Total cost ${formatUsd(totalCostUsd)} ${totalCostUsd <= mission.budgetUsd ? "is within" : "is over"} the ${formatUsd(mission.budgetUsd)} budget.`,
    },
    {
      id: "schedule",
      ok: devMonths <= mission.deadlineMonths,
      message: `Development takes ${devMonths} months and ${devMonths <= mission.deadlineMonths ? "meets" : "misses"} the ${mission.deadlineMonths}-month deadline.`,
    },
  ];

  return {
    massKg,
    maxMassKg,
    launcherCapacityKg,
    powerDrawnW,
    powerProducedW,
    costByRole,
    allocationByRole,
    teamCostUsd,
    totalCostUsd,
    devMonths,
    checks,
    pass: checks.every((c) => c.ok),
  };
}

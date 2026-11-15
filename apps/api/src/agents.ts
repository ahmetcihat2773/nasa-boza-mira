/**
 * AI Mission Control: the two agents.
 *
 * - Mission Designer: asks Claude for a design (part ids), checks it with the sim, feeds the failed
 *   checks back and retries (up to MAX_CLAUDE_ATTEMPTS). If Claude is unavailable or still fails,
 *   the built-in designer from @space-mission/sim finishes the job.
 * - Mission Monitor: gives Claude the launch telemetry and the recovery options computed by the sim;
 *   Claude diagnoses the problem and picks one option. An invalid or missing answer falls back to
 *   the built-in rule.
 *
 * Claude only proposes; the sim always decides what is valid. Nothing here throws.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  AUTOPILOT_SCENARIO,
  applyRecovery,
  autoDesign,
  autopilotMission,
  catalogueText,
  chooseRecovery,
  evaluateDesign,
  fromDesignIds,
  launchTelemetry,
  situationFor,
  templateDesign,
  toDesignIds,
  type DesignIds,
  type DesignStep,
  type RecoveryOptionId,
  type RecoveryOutcome,
  type Situation,
} from "@space-mission/sim";
import { runClaude } from "./flight-director.ts";

const PROMPTS = join(dirname(fileURLToPath(import.meta.url)), "..", "prompts");
export const MAX_CLAUDE_ATTEMPTS = 3;

/** Runs Claude once with a system prompt file and a JSON input; resolves with the raw text answer. */
export type ClaudeFn = (promptFile: string, input: unknown, timeoutMs: number) => Promise<string>;

export const defaultClaude: ClaudeFn = (promptFile, input, timeoutMs) =>
  runClaude(input, { prompt: readFileSync(join(PROMPTS, promptFile), "utf8"), timeoutMs, maxChars: 8000 });

/**
 * The first JSON object in a text answer that has the wanted key (models sometimes add prose,
 * code fences or a second object). Scans for balanced braces outside strings.
 */
export function parseJsonObject(text: string, key?: string): Record<string, unknown> | null {
  for (let start = text.indexOf("{"); start >= 0; start = text.indexOf("{", start + 1)) {
    let depth = 0;
    let inString = false;
    for (let i = start; i < text.length; i++) {
      const ch = text[i];
      if (inString) {
        if (ch === "\\") i++;
        else if (ch === '"') inString = false;
      } else if (ch === '"') inString = true;
      else if (ch === "{") depth++;
      else if (ch === "}" && --depth === 0) {
        try {
          const v: unknown = JSON.parse(text.slice(start, i + 1));
          if (v && typeof v === "object" && !Array.isArray(v) && (!key || key in v))
            return v as Record<string, unknown>;
        } catch {
          /* not JSON: try the next opening brace */
        }
        break;
      }
    }
  }
  return null;
}

const errText = (err: unknown) => {
  const e = err as NodeJS.ErrnoException | undefined;
  return e?.code === "ENOENT" ? "claude CLI not found" : err instanceof Error ? err.message : String(err);
};

function missionBrief() {
  const m = autopilotMission();
  return {
    name: m.name,
    objective: m.objective,
    budgetUsd: m.budgetUsd,
    deadlineMonths: m.deadlineMonths,
    teamCostPerMonthUsd: m.teamCostPerMonthUsd,
    requirements: m.card.requirements.map((r) => `${r.id}: ${r.text}`),
  };
}

// ---------- Agent 1: Mission Designer ----------

export interface DesignerResult {
  source: "claude" | "autopilot" | "claude+autopilot";
  steps: (DesignStep & { reasoning?: string })[];
  final: DesignIds;
  pass: boolean;
  fallbackReason?: string;
}

export async function runDesigner(claude: ClaudeFn = defaultClaude): Promise<DesignerResult> {
  const mission = autopilotMission();
  const s = AUTOPILOT_SCENARIO;
  const steps: DesignerResult["steps"] = [];
  const brief = {
    mission: missionBrief(),
    knownRisk: s.anomaly.risk,
    contingencyRequirement: `C1: carry thruster delta-v of at least the transfer from ${s.anomaly.shortfallKm} km below the planned orbit back up to it, plus ${Math.round(s.recoveryMargin * 100)}% margin (about 92 m/s for a 525 km orbit).`,
    catalogue: catalogueText(mission),
  };
  let fallbackReason: string | undefined;
  let lastIds: DesignIds | undefined;

  for (let attempt = 1; attempt <= MAX_CLAUDE_ATTEMPTS; attempt++) {
    const previousAttempts = steps.map((x) => ({
      design: x.ids,
      failedChecks: x.failures.map((f) => f.message),
    }));
    let text: string;
    try {
      text = await claude("mission-designer.md", { ...brief, previousAttempts }, 120_000);
    } catch (err) {
      fallbackReason = errText(err);
      break;
    }
    const json = parseJsonObject(text, "design");
    const raw = json?.design as DesignIds | undefined;
    if (!json || !raw || typeof raw !== "object" || !raw.parts) {
      fallbackReason = "Claude's answer was not a design";
      console.warn(`[designer] attempt ${attempt}: could not read a design from: ${text.slice(0, 300)}`);
      continue;
    }
    const { design, problems } = fromDesignIds({
      ...raw,
      instruments: Array.isArray(raw.instruments) ? raw.instruments : [],
    });
    const ev = evaluateDesign(design, mission);
    const failures = [
      ...problems.map((message) => ({ id: "ids", ok: false, blocking: true, message })),
      ...ev.failures,
    ];
    lastIds = toDesignIds(design);
    steps.push({
      attempt,
      source: "claude",
      note: attempt === 1 ? "First design proposed by Claude." : "Claude revised the design after the failed checks.",
      reasoning: typeof json.reasoning === "string" ? json.reasoning.slice(0, 1200) : undefined,
      ids: lastIds,
      failures,
      pass: failures.length === 0,
      totalCostUsd: ev.budget.totalCostUsd,
    });
    if (failures.length === 0) return { source: "claude", steps, final: lastIds, pass: true };
  }

  // Claude was unavailable or did not reach a passing design: the built-in designer finishes.
  const fromClaude = lastIds ? fromDesignIds(lastIds).design : undefined;
  const repair = autoDesign(fromClaude?.parts.structure ? fromClaude : templateDesign(), mission, {
    firstAttempt: steps.length + 1,
    startNote: fromClaude?.parts.structure
      ? "The built-in designer takes over from Claude's last design."
      : "Started from a proven 12U CubeSat template for wildfire detection.",
  });
  const rest = fromClaude?.parts.structure
    ? repair.slice(1).map((x, i) => ({ ...x, attempt: steps.length + 1 + i }))
    : repair;
  steps.push(...rest);
  const last = steps[steps.length - 1]!;
  return {
    source: steps.some((x) => x.source === "claude") ? "claude+autopilot" : "autopilot",
    steps,
    final: last.ids,
    pass: last.pass,
    ...(fallbackReason ? { fallbackReason } : {}),
  };
}

// ---------- Agent 2: Mission Monitor ----------

export interface MonitorResult {
  source: "claude" | "autopilot";
  diagnosis: string;
  optionId: RecoveryOptionId;
  reasoning: string;
  situation: Situation;
  outcome: RecoveryOutcome;
  fallbackReason?: string;
}

function builtInDiagnosis(sit: Situation): string {
  return `At stage 2 cut-off the rocket stopped early, and the spacecraft was released at ${sit.actualAltitudeKm} km instead of ${sit.plannedAltitudeKm} km. At that height air drag would bring it down in about ${sit.lifetimeIfNothingYears.toFixed(1)} years, so R4 (at least ${sit.minLifetimeYears} year in orbit) would fail.`;
}

export async function runMonitor(
  ids: DesignIds,
  claude: ClaudeFn = defaultClaude,
): Promise<MonitorResult | { error: string }> {
  const mission = autopilotMission();
  const { design, problems } = fromDesignIds(ids);
  if (problems.length) return { error: problems.join(" ") };
  const situation = situationFor(design, mission);
  const telemetry = launchTelemetry(design, mission);

  let fallbackReason: string | undefined;
  try {
    const text = await claude(
      "mission-monitor.md",
      { mission: missionBrief(), knownRisk: AUTOPILOT_SCENARIO.anomaly.risk, telemetry, situation },
      60_000,
    );
    const json = parseJsonObject(text, "optionId");
    if (!json) console.warn(`[monitor] could not read a decision from: ${text.slice(0, 300)}`);
    const optionId = json?.optionId;
    const option = situation.options.find((o) => o.id === optionId);
    if (json && option?.feasible && typeof json.diagnosis === "string") {
      return {
        source: "claude",
        diagnosis: json.diagnosis.slice(0, 1200),
        optionId: option.id,
        reasoning: typeof json.reasoning === "string" ? json.reasoning.slice(0, 800) : "",
        situation,
        outcome: applyRecovery(design, mission, option.id),
      };
    }
    fallbackReason = option
      ? "Claude chose an option that is not feasible"
      : "Claude's answer was not a valid decision";
  } catch (err) {
    fallbackReason = errText(err);
  }
  const choice = chooseRecovery(situation);
  return {
    source: "autopilot",
    diagnosis: builtInDiagnosis(situation),
    optionId: choice.optionId,
    reasoning: choice.reasoning,
    situation,
    outcome: applyRecovery(design, mission, choice.optionId),
    ...(fallbackReason ? { fallbackReason } : {}),
  };
}

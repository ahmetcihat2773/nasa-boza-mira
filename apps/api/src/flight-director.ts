/**
 * AI Flight Director (T22): a short debrief that explains WHY the mission went the way it did.
 * It runs the local Claude CLI (`claude -p`) with every tool disabled and a fixed prompt file,
 * and falls back to a template built from the cause chain when the CLI is missing, fails or times out.
 */
import { spawn as nodeSpawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { FlightDirectorRequest } from "./schemas.ts";

export const PROMPT_FILE = join(dirname(fileURLToPath(import.meta.url)), "..", "prompts", "flight-director.md");
export const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_OUTPUT_CHARS = 4000;

/** The JSON the model sees: the result's outcome and cause chain, nothing else. */
export type DebriefInput = {
  missionId: string;
  missionName?: string;
  success: boolean;
  failureReasons: string[];
  score: { total: number; stars: number } | null;
  causes: { phase: string; tone: string; text: string }[];
  realMission: { name: string; reason: string };
};

export function toDebriefInput(req: FlightDirectorRequest): DebriefInput {
  const r = req.result;
  return {
    missionId: req.missionId,
    ...(req.missionName ? { missionName: req.missionName } : {}),
    success: r.success,
    failureReasons: r.failureReasons,
    score: r.score ? { total: r.score.total, stars: r.score.stars } : null,
    causes: r.causes.map(({ phase, tone, text }) => ({ phase, tone, text })),
    realMission: { name: r.realMission.mission.name, reason: r.realMission.reason },
  };
}

export type Debrief = {
  source: "claude" | "template";
  text: string;
  /** Why the template was used (missing CLI, error, timeout). */
  fallbackReason?: string;
};

/** Debrief built only from the cause chain; used when Claude is not available. */
export function templateDebrief(input: DebriefInput): string {
  const name = input.missionName ?? "The mission";
  const opening = input.success
    ? `${name} succeeded${input.score ? ` with ${input.score.total} points and ${input.score.stars} star${input.score.stars === 1 ? "" : "s"}` : ""}.`
    : `${name} did not succeed.`;
  const good = input.causes.filter((c) => c.tone === "good").map((c) => c.text);
  const bad = input.causes.filter((c) => c.tone === "bad").map((c) => c.text);
  const parts = [opening];
  if (!input.success && input.failureReasons.length) parts.push(`Main reason: ${input.failureReasons[0]}`);
  if (good.length) parts.push(`What helped: ${good.slice(0, 2).join(" ")}`);
  if (bad.length) parts.push(`What hurt: ${bad.slice(0, 2).join(" ")}`);
  if (!good.length && !bad.length && input.causes.length) parts.push(input.causes[0]!.text);
  parts.push(
    bad.length
      ? "Next time, start by fixing the first problem in the chain; later problems often follow from it."
      : "Next time, try a cheaper or faster design and see if it still holds up.",
  );
  return parts.map((p) => p.trim()).join(" ");
}

export type SpawnFn = (
  command: string,
  args: string[],
  options: { windowsHide: boolean; shell: false },
) => ChildProcessWithoutNullStreams;

export type ClaudeRunnerOptions = {
  bin?: string;
  timeoutMs?: number;
  prompt?: string;
  spawn?: SpawnFn;
};

/** Finds the Claude CLI. On Windows the npm shim is a .cmd file, which cannot run without a shell, so look for claude.exe. */
export function resolveClaudeBin(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): string {
  if (env.CLAUDE_BIN) return env.CLAUDE_BIN;
  if (platform !== "win32") return "claude";
  const dirs = (env.PATH ?? env.Path ?? "").split(delimiter).filter(Boolean);
  for (const dir of dirs) {
    for (const candidate of [
      join(dir, "claude.exe"),
      join(dir, "node_modules", "@anthropic-ai", "claude-code", "bin", "claude.exe"),
    ]) {
      if (existsSync(candidate)) return candidate;
    }
  }
  return "claude.exe";
}

/** Arguments for a tool-less, one-shot, text-only run with the fixed system prompt. */
export function claudeArgs(prompt: string): string[] {
  return [
    "-p",
    "--tools",
    "",
    "--strict-mcp-config",
    "--output-format",
    "text",
    "--no-session-persistence",
    "--system-prompt",
    prompt,
  ];
}

/** Runs `claude -p` once. The input JSON goes on stdin; resolves with stdout text or rejects. */
export function runClaude(input: DebriefInput, opts: ClaudeRunnerOptions = {}): Promise<string> {
  const prompt = opts.prompt ?? readFileSync(PROMPT_FILE, "utf8");
  const spawn = opts.spawn ?? (nodeSpawn as unknown as SpawnFn);
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return new Promise((resolve, reject) => {
    let child: ChildProcessWithoutNullStreams;
    try {
      child = spawn(opts.bin ?? resolveClaudeBin(), claudeArgs(prompt), { windowsHide: true, shell: false });
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
      return;
    }
    let out = "";
    let errText = "";
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };
    const timer = setTimeout(() => {
      finish(() => reject(new Error(`timed out after ${timeoutMs} ms`)));
      child.kill();
    }, timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (d: string) => {
      if (out.length < MAX_OUTPUT_CHARS * 2) out += d;
    });
    child.stderr.on("data", (d: string) => {
      if (errText.length < 2000) errText += d;
    });
    child.on("error", (err) => finish(() => reject(err)));
    child.on("close", (code) =>
      finish(() => {
        const text = out.trim();
        if (code !== 0)
          reject(new Error(`claude exited with code ${code}${errText ? `: ${errText.trim().slice(0, 300)}` : ""}`));
        else if (!text) reject(new Error("claude returned no text"));
        else resolve(text.slice(0, MAX_OUTPUT_CHARS));
      }),
    );
    child.stdin.on("error", () => {
      /* the process may exit before reading; the close handler reports it */
    });
    child.stdin.end(JSON.stringify(input));
  });
}

export type FlightDirector = (input: DebriefInput) => Promise<Debrief>;

/** The debrief service: Claude first, template on any failure. Never throws. */
export function createFlightDirector(
  run: (input: DebriefInput) => Promise<string> = (i) => runClaude(i),
): FlightDirector {
  return async (input) => {
    try {
      return { source: "claude", text: await run(input) };
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      const missing = (err as NodeJS.ErrnoException | undefined)?.code === "ENOENT";
      return {
        source: "template",
        text: templateDebrief(input),
        fallbackReason: missing ? "claude CLI not found" : reason,
      };
    }
  };
}

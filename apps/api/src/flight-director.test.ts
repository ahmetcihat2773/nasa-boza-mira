import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "./app.ts";
import {
  claudeArgs,
  createFlightDirector,
  resolveClaudeBin,
  runClaude,
  templateDebrief,
  type DebriefInput,
  type SpawnFn,
} from "./flight-director.ts";

const input: DebriefInput = {
  missionId: "wildfire",
  missionName: "Wildfire watch",
  success: false,
  failureReasons: ["The battery ran flat in eclipse."],
  score: null,
  causes: [
    { phase: "design", tone: "good", text: "The camera sees active fires." },
    { phase: "design", tone: "bad", text: "The battery was too small for the eclipse." },
    { phase: "result", tone: "bad", text: "The satellite lost power." },
  ],
  realMission: { name: "FireSat", reason: "Your design resembles FireSat." },
};

/** A fake child process: records stdin, then answers with the given stdout and exit code. */
function fakeSpawn(reply: {
  stdout?: string;
  stderr?: string;
  code?: number;
  error?: NodeJS.ErrnoException;
  hang?: boolean;
}) {
  const calls: { command: string; args: string[]; options: unknown; stdin: string }[] = [];
  const spawn: SpawnFn = (command, args, options) => {
    if (reply.error && reply.error.code === "THROW") throw reply.error;
    const child = new EventEmitter() as EventEmitter & Record<string, unknown>;
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    const call = { command, args, options, stdin: "" };
    calls.push(call);
    stdin.on("data", (d) => (call.stdin += String(d)));
    Object.assign(child, { stdin, stdout, stderr, kill: vi.fn(() => child.emit("close", null)) });
    stdin.on("finish", () => {
      if (reply.hang) return;
      setImmediate(() => {
        if (reply.error) return void child.emit("error", reply.error);
        if (reply.stdout) stdout.write(reply.stdout);
        if (reply.stderr) stderr.write(reply.stderr);
        stdout.end();
        stderr.end();
        setImmediate(() => child.emit("close", reply.code ?? 0));
      });
    });
    return child as unknown as ReturnType<SpawnFn>;
  };
  return { spawn, calls };
}

describe("runClaude", () => {
  it("spawns without a shell, tools disabled, the prompt fixed and the JSON on stdin", async () => {
    const { spawn, calls } = fakeSpawn({ stdout: "  Your battery was too small.  \n" });
    const text = await runClaude(input, { spawn, bin: "claude", prompt: "PROMPT" });
    expect(text).toBe("Your battery was too small.");
    expect(calls[0]!.command).toBe("claude");
    expect(calls[0]!.options).toMatchObject({ shell: false });
    expect(calls[0]!.args).toEqual(claudeArgs("PROMPT"));
    expect(calls[0]!.args.slice(0, 3)).toEqual(["-p", "--tools", ""]);
    expect(JSON.parse(calls[0]!.stdin)).toEqual(input);
  });

  it("reads the prompt file by default", async () => {
    const { spawn, calls } = fakeSpawn({ stdout: "ok" });
    await runClaude(input, { spawn, bin: "claude" });
    expect(calls[0]!.args.at(-1)).toContain("Flight Director");
  });

  it("rejects on a non-zero exit, empty output, spawn error or timeout", async () => {
    await expect(runClaude(input, { ...fakeSpawn({ code: 1, stderr: "not logged in" }), prompt: "P" })).rejects.toThrow(
      /code 1: not logged in/,
    );
    await expect(runClaude(input, { ...fakeSpawn({ stdout: "   " }), prompt: "P" })).rejects.toThrow(/no text/);
    const enoent = Object.assign(new Error("spawn claude ENOENT"), { code: "ENOENT" });
    await expect(runClaude(input, { ...fakeSpawn({ error: enoent }), prompt: "P" })).rejects.toThrow(/ENOENT/);
    await expect(runClaude(input, { ...fakeSpawn({ hang: true }), prompt: "P", timeoutMs: 20 })).rejects.toThrow(
      /timed out/,
    );
  });
});

describe("createFlightDirector", () => {
  it("returns Claude's text when the CLI works", async () => {
    const fd = createFlightDirector(async () => "Debrief from Claude.");
    expect(await fd(input)).toEqual({ source: "claude", text: "Debrief from Claude." });
  });

  it("falls back to the template when the CLI is missing or fails", async () => {
    const missing = createFlightDirector(() =>
      Promise.reject(Object.assign(new Error("spawn claude ENOENT"), { code: "ENOENT" })),
    );
    const res = await missing(input);
    expect(res.source).toBe("template");
    expect(res.fallbackReason).toBe("claude CLI not found");
    expect(res.text).toBe(templateDebrief(input));

    const failed = await createFlightDirector(() => Promise.reject(new Error("timed out after 30000 ms")))(input);
    expect(failed).toMatchObject({ source: "template", fallbackReason: "timed out after 30000 ms" });
  });
});

describe("templateDebrief", () => {
  it("uses only the cause chain and the outcome", () => {
    const text = templateDebrief(input);
    expect(text).toContain("Wildfire watch did not succeed.");
    expect(text).toContain("The battery ran flat in eclipse.");
    expect(text).toContain("The camera sees active fires.");
    expect(text).toContain("The battery was too small for the eclipse.");
  });

  it("mentions score and stars on success", () => {
    const text = templateDebrief({ ...input, success: true, failureReasons: [], score: { total: 820, stars: 3 } });
    expect(text.startsWith("Wildfire watch succeeded with 820 points and 3 stars.")).toBe(true);
  });
});

describe("resolveClaudeBin", () => {
  it("honours CLAUDE_BIN and uses plain 'claude' outside Windows", () => {
    expect(resolveClaudeBin({ CLAUDE_BIN: "/opt/claude" }, "linux")).toBe("/opt/claude");
    expect(resolveClaudeBin({ PATH: "/usr/bin" }, "linux")).toBe("claude");
  });
});

describe("POST /flight-director", () => {
  const result = {
    seed: 1,
    success: false,
    failureReasons: input.failureReasons,
    score: null,
    causes: input.causes,
    realMission: { mission: { id: "firesat", name: "FireSat" }, reason: "Your design resembles FireSat." },
    events: [],
  };

  it("sends only the outcome and cause chain to the Flight Director", async () => {
    const seen: DebriefInput[] = [];
    const app = createApp({
      flightDirector: async (i) => {
        seen.push(i);
        return { source: "claude", text: "All good." };
      },
    });
    const res = await app.request("/flight-director", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ missionId: "wildfire", missionName: "Wildfire watch", result }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()) as any).toEqual({ source: "claude", text: "All good." });
    expect(seen[0]).toEqual(input);
  });

  it("answers with the template when Claude fails", async () => {
    const app = createApp({ flightDirector: createFlightDirector(() => Promise.reject(new Error("boom"))) });
    const res = await app.request("/flight-director", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ missionId: "wildfire", result }),
    });
    const body = (await res.json()) as any;
    expect(body.source).toBe("template");
    expect(body.text).toContain("The mission did not succeed.");
  });

  it("rejects an invalid body", async () => {
    const res = await createApp().request("/flight-director", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(400);
  });
});

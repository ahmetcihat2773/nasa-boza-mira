/**
 * Client for the local API (apps/api, http://127.0.0.1:8787). Every call fails softly:
 * when the API is not running the game keeps working with the attempts in the store.
 */
import type { Design, MissionResult } from "@space-mission/sim";

export const API_URL: string = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8787";

/** An attempt as the API returns it. */
export interface ApiAttempt {
  id: number;
  missionId: string;
  nicknames: string[];
  seed: string;
  success: boolean;
  score: number;
  stars: number;
  createdAt: string;
  design: Design;
  result: MissionResult;
}
export type LeaderboardEntry = Omit<ApiAttempt, "design" | "result"> & { rank: number };
export interface Debrief {
  source: "claude" | "template";
  text: string;
}

async function call<T>(path: string, init: RequestInit = {}, timeoutMs = 5000): Promise<T | null> {
  try {
    const res = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: init.body ? { "Content-Type": "application/json" } : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function postAttempt(a: {
  missionId: string;
  nicknames: string[];
  seed: number;
  design: Design;
  result: MissionResult;
}): Promise<ApiAttempt | null> {
  const r = await call<{ attempt: ApiAttempt }>("/attempts", { method: "POST", body: JSON.stringify(a) });
  return r?.attempt ?? null;
}

export async function recentAttempts(missionId: string, limit = 20): Promise<ApiAttempt[] | null> {
  const r = await call<{ attempts: ApiAttempt[] }>(
    `/attempts?missionId=${encodeURIComponent(missionId)}&limit=${limit}`,
  );
  return r?.attempts ?? null;
}

export async function leaderboard(missionId: string, limit = 10): Promise<LeaderboardEntry[] | null> {
  const r = await call<{ entries: LeaderboardEntry[] }>(`/leaderboard/${encodeURIComponent(missionId)}?limit=${limit}`);
  return r?.entries ?? null;
}

const debriefs = new Map<string, Promise<Debrief | null>>();

/** The Flight Director debrief (can take up to 30 s). One request per key, so re-renders do not ask twice. */
export function flightDirector(
  key: string,
  missionId: string,
  missionName: string,
  result: MissionResult,
): Promise<Debrief | null> {
  let p = debriefs.get(key);
  if (!p) {
    p = call<Debrief>(
      "/flight-director",
      { method: "POST", body: JSON.stringify({ missionId, missionName, result }) },
      45_000,
    );
    debriefs.set(key, p);
  }
  return p;
}

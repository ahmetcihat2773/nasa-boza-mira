import type { Mission, MissionResult } from "@space-mission/sim";
import { useEffect, useState } from "react";
import {
  flightDirector,
  leaderboard,
  recentAttempts,
  type ApiAttempt,
  type Debrief,
  type LeaderboardEntry,
} from "../api.ts";
import type { Attempt } from "../flow.ts";

/** Turns a saved API attempt into the store's attempt shape, for Compare. */
export function fromApi(a: ApiAttempt): Attempt {
  return {
    number: a.id,
    nickname: a.nicknames.join(", "),
    seed: Number(a.seed),
    design: a.design,
    result: a.result,
    decisions: {},
  };
}

/** Recent attempts from the API once `ready` (the current attempt is saved); null while loading or offline. */
export function useRecentAttempts(missionId: string, ready: unknown): ApiAttempt[] | null {
  const [list, setList] = useState<ApiAttempt[] | null>(null);
  useEffect(() => {
    if (typeof ready !== "number") return;
    let live = true;
    void recentAttempts(missionId).then((r) => live && setList(r));
    return () => {
      live = false;
    };
  }, [missionId, ready]);
  return list;
}

export function Leaderboard({ missionId, ready }: { missionId: string; ready: unknown }) {
  const [entries, setEntries] = useState<LeaderboardEntry[] | null | undefined>(undefined);
  useEffect(() => {
    if (ready === "saving") return;
    let live = true;
    void leaderboard(missionId).then((r) => live && setEntries(r));
    return () => {
      live = false;
    };
  }, [missionId, ready]);

  return (
    <div>
      <h3>Leaderboard</h3>
      {entries === undefined && <p className="muted small">Loading…</p>}
      {entries === null && (
        <p className="muted small">The leaderboard needs the local API (apps/api), which is not running.</p>
      )}
      {entries && entries.length === 0 && <p className="muted small">No successful missions yet. Be the first.</p>}
      {entries && entries.length > 0 && (
        <table className="compare">
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">Team</th>
              <th scope="col">Score</th>
              <th scope="col">Stars</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id} className={ready === e.id ? "diff" : ""}>
                <td>{e.rank}</td>
                <td>{e.nicknames.join(", ")}</td>
                <td>{e.score}</td>
                <td>{"★".repeat(e.stars)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/** The Flight Director debrief: loads after the result is on screen and never blocks it. */
export function FlightDirectorDebrief({
  attemptKey,
  mission,
  result,
}: {
  attemptKey: string;
  mission: Mission;
  result: MissionResult;
}) {
  const [debrief, setDebrief] = useState<Debrief | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    setDebrief(undefined);
    void flightDirector(attemptKey, mission.id, mission.name, result).then((d) => live && setDebrief(d));
    return () => {
      live = false;
    };
  }, [attemptKey, mission, result]);

  return (
    <div className="debrief" aria-live="polite">
      <h3>Flight Director debrief</h3>
      {debrief === undefined && <p className="muted small">The Flight Director is reviewing your mission…</p>}
      {debrief === null && <p className="muted small">No debrief: the local API (apps/api) is not running.</p>}
      {debrief && (
        <>
          {debrief.text.split(/\n{2,}/).map((para, i) => (
            <p key={i}>{para}</p>
          ))}
          {debrief.source === "template" && (
            <p className="muted small">
              Written from the report template, because the AI Flight Director was not available.
            </p>
          )}
        </>
      )}
    </div>
  );
}

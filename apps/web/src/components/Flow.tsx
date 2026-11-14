import type { EventEffects, EventPhase } from "@space-mission/data";
import {
  formatUsd,
  planEvents,
  type Budget,
  type Cause,
  type Design,
  type Mission,
  type RunEvent,
} from "@space-mission/sim";
import { useState, type ReactNode } from "react";
import { PHASE_STEPS, useFlow, type Attempt, type Phase } from "../flow.ts";
import { Term } from "./Glossary.tsx";
import { RequirementsPanel } from "./Requirements.tsx";
import { VotePanel, useWho } from "./Team.tsx";
import { ROLE_LABEL, ROLE_ORDER, assignRoles, useTeam, type Player } from "../team.ts";
import { FlightDirectorDebrief, Leaderboard, fromApi, useRecentAttempts } from "./ResultsExtras.tsx";
import { ROLES } from "./RoleTabs.tsx";

// ---------- Phase stepper ----------

export function PhaseStepper({ phase }: { phase: Phase }) {
  const current = PHASE_STEPS.findIndex((s) => s.phase === phase);
  return (
    <ol className="phases" aria-label="Game phases">
      {PHASE_STEPS.map((s, i) => {
        const state = s.phase === phase ? "now" : i < current ? "done" : "todo";
        return (
          <li key={s.label} className={`phase ${state}`} aria-current={s.phase === phase ? "step" : undefined}>
            {s.label}
          </li>
        );
      })}
    </ol>
  );
}

// ---------- 0. Setup ----------

export function SetupScreen() {
  const start = useFlow((s) => s.start);
  const setTeam = useTeam((s) => s.setTeam);
  const [mode, setMode] = useState<"solo" | "team">("solo");
  const [names, setNames] = useState<string[]>(["", ""]);
  // owner[i] = index of the player who plays ROLE_ORDER[i].
  const [owner, setOwner] = useState<number[]>(() => ROLE_ORDER.map((_, i) => i % 2));
  const setCount = (n: number) => {
    setNames(Array.from({ length: n }, (_, i) => names[i] ?? ""));
    setOwner(
      assignRoles(n)
        .flatMap((roles, p) => roles.map((r) => [ROLE_ORDER.indexOf(r), p] as const))
        .sort((x, y) => x[0] - y[0])
        .map(([, p]) => p),
    );
  };
  const count = mode === "solo" ? 1 : names.length;
  const nick = (i: number) => names[i]?.trim() || (mode === "solo" ? "Player" : `Player ${i + 1}`);
  const roleless = mode === "team" ? names.map((_, i) => i).filter((i) => !owner.includes(i)) : [];

  return (
    <form
      className="screen card"
      onSubmit={(e) => {
        e.preventDefault();
        if (roleless.length > 0) return;
        const players: Player[] = Array.from({ length: count }, (_, i) => ({
          nickname: nick(i),
          roles: mode === "solo" ? [...ROLE_ORDER] : ROLE_ORDER.filter((_, r) => owner[r] === i),
        }));
        setTeam(mode, players);
        start(players.map((p) => p.nickname).join(", "));
      }}
    >
      <h2>New game</h2>
      <fieldset className="orbit-choice">
        <legend>Mode</legend>
        <label className="radio">
          <input type="radio" name="mode" checked={mode === "solo"} onChange={() => setMode("solo")} /> Solo: you play
          all four roles, and role advisors raise requests
        </label>
        <label className="radio">
          <input type="radio" name="mode" checked={mode === "team"} onChange={() => setMode("team")} /> Team (hot-seat):
          2–4 players take turns on this screen
        </label>
      </fieldset>
      {mode === "team" && (
        <label className="field">
          Players
          <select value={names.length} onChange={(e) => setCount(Number(e.target.value))}>
            {[2, 3, 4].map((n) => (
              <option key={n} value={n}>
                {n} players
              </option>
            ))}
          </select>
        </label>
      )}
      {Array.from({ length: count }, (_, i) => (
        <label className="field" key={i}>
          {mode === "solo" ? "Your nickname" : `Player ${i + 1} nickname`}
          <input
            value={names[i] ?? ""}
            onChange={(e) => setNames(names.map((n, j) => (j === i ? e.target.value : n)))}
            placeholder={nick(i)}
            maxLength={24}
            autoFocus={i === 0}
          />
        </label>
      ))}
      {mode === "team" && (
        <fieldset className="orbit-choice">
          <legend>Roles (fewer players take more roles)</legend>
          {ROLE_ORDER.map((r, ri) => (
            <label key={r} className="player-row">
              <span style={{ minWidth: 90 }}>{ROLE_LABEL[r]}</span>
              <select
                value={owner[ri]}
                onChange={(e) => setOwner(owner.map((o, j) => (j === ri ? Number(e.target.value) : o)))}
              >
                {names.map((_, p) => (
                  <option key={p} value={p}>
                    {nick(p)}
                  </option>
                ))}
              </select>
            </label>
          ))}
          {roleless.length > 0 && (
            <p className="bad small">Every player needs at least one role: {roleless.map(nick).join(", ")}.</p>
          )}
        </fieldset>
      )}
      <button className="launch" type="submit" disabled={roleless.length > 0}>
        Start
      </button>
    </form>
  );
}

// ---------- 1. Briefing ----------

export function BriefingScreen({ mission }: { mission: Mission }) {
  const goTo = useFlow((s) => s.goTo);
  const c = mission.card;
  return (
    <section className="screen card">
      <div className="kicker">Briefing · Mission card</div>
      <h2>{c.name}</h2>
      <p>{c.objective}</p>
      <p className="muted">{c.whyItMatters}</p>
      <div className="brief-grid">
        <div>
          <h3>Requirements</h3>
          <ul className="plain">
            {c.requirements.map((r) => (
              <li key={r.id}>
                <b>
                  {r.id} · {r.title}:
                </b>{" "}
                {r.text}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3>Constraints</h3>
          <ul className="plain">
            <li>Budget: {formatUsd(c.constraints.budgetUsd)}</li>
            <li>
              <Term id="deadline" focusable>
                Deadline
              </Term>
              : {c.deadlineMonths} months (missing it means waiting {c.lateWaitMonths} months for the next launch)
            </li>
            <li>Destination: {c.destination}</li>
            <li>
              Target: {c.targetRegion.name} ({c.targetRegion.widthKm} km wide, latitude {c.targetRegion.latDeg}°)
            </li>
            <li>
              <Term id="team-cost" focusable>
                Team cost
              </Term>
              : {formatUsd(c.teamCostPerMonthUsd)} per month
            </li>
          </ul>
          <h3>
            <Term id="allocation" focusable>
              Budget allocations
            </Term>
          </h3>
          <ul className="plain">
            {ROLES.map((r) => (
              <li key={r.id}>
                {r.label}: {c.allocationsPct[r.id]}% (
                {formatUsd((c.constraints.budgetUsd * c.allocationsPct[r.id]) / 100)})
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3>Bonus objectives</h3>
          <ul className="plain">
            {c.bonusObjectives.map((b) => (
              <li key={b.id}>
                <b>{b.name}:</b> {b.text}
              </li>
            ))}
          </ul>
          <h3>Trade-offs to think about</h3>
          <ul className="plain">
            {c.tradeOffs.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
      </div>
      <button className="launch" onClick={() => goTo("design")}>
        Start the design
      </button>
    </section>
  );
}

// ---------- 4. Design approval ----------

export function ApprovalScreen({ b, onApprove }: { b: Budget; onApprove: () => void }) {
  const goTo = useFlow((s) => s.goTo);
  return (
    <section className="screen card">
      <div className="kicker">Design approval</div>
      <h2>{b.pass ? "The design passes its review" : "The design does not pass its review yet"}</h2>
      <p className="muted">
        {b.pass
          ? "Every requirement is met and the spacecraft fits the launcher and its orbit. Approve it to start development."
          : "You can still approve it, but the mission will then fail, and the report will explain why. You can also go back and fix it."}
      </p>
      <RequirementsPanel b={b} />
      <VotePanel
        question={b.pass ? "approve this design?" : "approve this design although it does not pass?"}
        yesLabel={b.pass ? "Approve the design" : "Approve anyway"}
        noLabel="Back to the design"
        onResult={(yes) => (yes ? onApprove() : goTo("design"))}
      />
    </section>
  );
}

// ---------- 5–7. Events ----------

/** Plain-English summary of an option's effects, shown before it is chosen. */
export function effectText(e: EventEffects): string {
  const parts: string[] = [];
  if (e.months) parts.push(`+${e.months} months`);
  if (e.costUsd) parts.push(`+${formatUsd(e.costUsd)}`);
  if (e.scienceDaysLost) parts.push(`${e.scienceDaysLost} days without observations`);
  if (e.failureRiskPct) parts.push(`${e.failureRiskPct}% risk of losing the mission`);
  if (e.performancePct) parts.push(`${e.performancePct > 0 ? "+" : ""}${e.performancePct}% performance`);
  if (e.sciencePct) parts.push(`${e.sciencePct > 0 ? "+" : ""}${e.sciencePct}% science`);
  if (e.dataBacklogDays) parts.push(`${e.dataBacklogDays} days of data backlog`);
  if (e.propulsionUsePct) parts.push(`uses ${e.propulsionUsePct}% of the propellant`);
  if (e.endsMission) parts.push("the mission is lost");
  return parts.join(" · ") || "no effect";
}

/** An event needs a decision when the deciding role has more than one option. */
export const needsDecision = (ev: RunEvent) => !ev.absorbed && ev.decidedBy !== null && ev.available.length > 1;

function EventCard({ ev }: { ev: RunEvent }) {
  const who = useWho();
  const decisions = useFlow((s) => s.decisions);
  const decide = useFlow((s) => s.decide);
  const ask = needsDecision(ev);
  const decided = !ask || decisions[ev.event.id] !== undefined;
  const tone = ev.absorbed ? "ok" : ev.lostMission && decided ? "bad" : "warn";

  return (
    <article className={`event req ${tone}`}>
      <div>
        <h3>{ev.event.name}</h3>
        <p>{ev.event.text}</p>
        <p className="muted small">
          <b>Why?</b> {ev.event.why}
        </p>
        {ev.absorbed && <p className="ok">Absorbed by your design: {ev.text}</p>}
        {ask && (
          <div className="decision">
            <div className="up-next">Up next: {who(ev.decidedBy)}</div>
            <div className="options" role="group" aria-label={`Decision for ${ev.event.name}`}>
              {ev.available.map((o) => {
                const active = decisions[ev.event.id] === o.id;
                return (
                  <button
                    key={o.id}
                    className={`option ${active ? "active" : ""}`}
                    aria-pressed={active}
                    onClick={() => decide(ev.event.id, o.id)}
                  >
                    <span className="name">{o.label}</span>
                    <span className="delta">{effectText(o.effects)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {!ev.absorbed && decided && <p className={ev.lostMission ? "bad" : ""}>{ev.chosen?.outcome}</p>}
        {!ev.absorbed && decided && ev.lostMission && !ev.chosen?.effects.endsMission && (
          <p className="bad">The risk did not pay off: the satellite was lost.</p>
        )}
      </div>
    </article>
  );
}

const PHASE_TITLE: Record<EventPhase, string> = {
  development: "Development",
  launch: "Launch: Go / No-Go",
  operations: "Operations",
};
const PHASE_INTRO: Record<EventPhase, string> = {
  development: "Time moves on while the team builds and tests the spacecraft. Some things go wrong.",
  launch: "The spacecraft is at the launch site. Deal with any last problems, then give the go for launch.",
  operations: "The satellite is in orbit and watching for fires. Mission time runs fast.",
};

/** One event phase: shows its events, asks the deciding role, then continues (lost = the satellite was lost). */
export function EventsScreen(props: {
  phase: EventPhase;
  design: Design;
  b: Budget;
  mission: Mission;
  continueLabel: string;
  onContinue: (lost: boolean) => void;
  /** A Go / No-Go vote before continuing (team: each role in turn; solo: one confirmation). */
  vote?: string;
  children?: ReactNode;
}) {
  const { phase, design, b, mission } = props;
  const seed = useFlow((s) => s.seed);
  const goTo = useFlow((s) => s.goTo);
  const decisions = useFlow((s) => s.decisions);
  const order: EventPhase[] = ["development", "launch", "operations"];
  // A failed design does not fly, so it meets no events.
  const all = b.pass ? planEvents(design, mission, seed, decisions) : [];
  const upToHere = all.filter((e) => order.indexOf(e.event.phase) <= order.indexOf(phase));
  const events = all.filter((e) => e.event.phase === phase);
  const pending = events.filter((e) => needsDecision(e) && decisions[e.event.id] === undefined).length;
  const lost = upToHere.some((e) => e.lostMission && (!needsDecision(e) || decisions[e.event.id] !== undefined));

  return (
    <section className="screen card">
      <div className="kicker">
        {PHASE_TITLE[phase]} · seed {seed}
      </div>
      <h2>{PHASE_TITLE[phase]}</h2>
      <p className="muted">{PHASE_INTRO[phase]}</p>
      {props.children}
      {!b.pass && <p className="bad">The design did not pass its review, so it cannot fly.</p>}
      {b.pass && events.length === 0 && <p className="ok">Nothing unexpected happened in this phase.</p>}
      <div className="events">
        {events.map((ev) => (
          <EventCard key={ev.event.id} ev={ev} />
        ))}
      </div>
      {lost && <p className="bad">The satellite was lost. See the results for what happened.</p>}
      {props.vote && pending === 0 && !lost ? (
        <VotePanel
          question={props.vote}
          yesLabel={props.continueLabel}
          noLabel="No-Go: back to the design"
          onResult={(yes) => (yes ? props.onContinue(false) : goTo("design"))}
        />
      ) : (
        <div className="actions">
          <button className="launch" disabled={pending > 0} onClick={() => props.onContinue(lost)}>
            {pending > 0
              ? `${pending} decision${pending > 1 ? "s" : ""} to make`
              : lost
                ? "See the results"
                : props.continueLabel}
          </button>
        </div>
      )}
    </section>
  );
}

// ---------- 8. Results ----------

const CAUSE_PHASES: Cause["phase"][] = ["design", "development", "launch", "operations", "result"];
const CAUSE_TITLE: Record<Cause["phase"], string> = {
  design: "Design",
  development: "Development",
  launch: "Launch",
  operations: "Operations",
  result: "Result",
};
const TONE_ICON = { good: "✓", bad: "✗", neutral: "•" } as const;

function Stars({ n }: { n: number }) {
  return (
    <span className="stars-row" aria-label={`${n} of 3 stars`}>
      {[1, 2, 3].map((i) => (
        <span key={i} className={i <= n ? "star on" : "star"} aria-hidden="true">
          ★
        </span>
      ))}
    </span>
  );
}

export function ResultsScreen(props: { mission: Mission; attempt: Attempt; previous: Attempt | undefined }) {
  const { mission, attempt, previous } = props;
  const retry = useFlow((s) => s.retrySameSeed);
  const again = useFlow((s) => s.newAttempt);
  const remote = useFlow((s) => s.remote[attempt.number]);
  const [compare, setCompare] = useState(false);
  const [otherKey, setOtherKey] = useState("");
  const r = attempt.result;
  // Compare with saved attempts from the API when it is running, else with the previous attempt in the store.
  const saved = useRecentAttempts(mission.id, remote);
  const candidates: { key: string; label: string; attempt: Attempt }[] = saved
    ? saved
        .filter((a) => a.id !== remote)
        .map((a) => ({
          key: `api-${a.id}`,
          label: `#${a.id} ${a.nicknames.join(", ")} · ${a.success ? `${a.score} points` : "failed"} · seed ${a.seed}`,
          attempt: fromApi(a),
        }))
    : previous
      ? [{ key: "local", label: `Attempt ${previous.number} · seed ${previous.seed}`, attempt: previous }]
      : [];
  const other = candidates.find((c) => c.key === otherKey) ?? candidates[0];

  return (
    <section className="screen card">
      <div className="kicker">
        Results · attempt {attempt.number} · seed {attempt.seed}
      </div>
      <div className={`result ${r.success ? "pass" : "fail"}`}>
        <div className="verdict">
          {r.success ? "Mission success" : "Mission failed"} {r.score && <Stars n={r.score.stars} />}
          {r.score && <span className="val"> {r.score.total} / 1000 points</span>}
        </div>
        {r.failureReasons.length > 0 && (
          <ul>
            {r.failureReasons.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        )}
        <p className="muted small">
          {remote === "saving"
            ? "Saving this attempt…"
            : remote === "offline"
              ? "Kept in this browser only: the local API is not running."
              : typeof remote === "number"
                ? `Saved as attempt #${remote}.`
                : ""}
        </p>
      </div>

      <FlightDirectorDebrief attemptKey={`${attempt.number}-${attempt.seed}`} mission={mission} result={r} />

      <div className="brief-grid">
        <div>
          <h3>Score</h3>
          {r.score ? (
            <ul className="plain">
              {r.score.components.map((c) => (
                <li key={c.id} className="score-line">
                  <div className="meter-head">
                    <span className="cap">{c.id}</span>
                    <span className="val">
                      {c.points} / {c.weight * 10}
                    </span>
                  </div>
                  <div className="bar">
                    <div className="fill ok" style={{ width: `${c.value}%` }} />
                  </div>
                  <span className="muted small">{c.explanation}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">A failed mission scores no points. Fix the causes below and try again.</p>
          )}
          <h3>Bonus objectives</h3>
          <ul className="plain">
            {r.bonuses.map((x) => (
              <li key={x.id} className={x.met ? "ok" : "muted"}>
                {x.met ? "✓" : "✗"} {x.name}
              </li>
            ))}
          </ul>
          <Leaderboard missionId={mission.id} ready={remote} />
          <h3>Time and money</h3>
          <ul className="plain">
            <li>
              Ready for launch after {r.readyMonths} months
              {r.delayMonths ? ` (${r.delayMonths} months of event delays)` : ""}
              {r.deadlineMet ? ", within the deadline" : `, deadline missed (${r.waitMonths} months of waiting)`}.
            </li>
            <li>
              Total cost {formatUsd(r.totalCostUsd)}
              {r.extraCostUsd ? ` (${formatUsd(r.extraCostUsd)} from events)` : ""}, {formatUsd(r.budgetLeftUsd)} left.
            </li>
          </ul>
        </div>
        <div className="report">
          <h3>Post-mission report</h3>
          {CAUSE_PHASES.map((p) => {
            const lines = r.causes.filter((c) => c.phase === p);
            if (lines.length === 0) return null;
            return (
              <div key={p}>
                <h4>{CAUSE_TITLE[p]}</h4>
                <ul className="plain">
                  {lines.map((c, i) => (
                    <li key={i} className={`cause ${c.tone}`}>
                      <span aria-hidden="true">{TONE_ICON[c.tone]}</span> {c.text}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
          <h3>Real-mission match</h3>
          <p>
            {r.realMission.reason}{" "}
            <a href={r.realMission.mission.url} target="_blank" rel="noreferrer">
              Learn more
            </a>
          </p>
        </div>
      </div>

      <div className="actions">
        <button className="launch" onClick={retry} title="Same seed: the same events happen, only your design changes.">
          Fix the design and retry (same seed)
        </button>
        <button className="ghost" onClick={again}>
          New attempt (new seed)
        </button>
        <button className="ghost" disabled={!other} onClick={() => setCompare(!compare)}>
          {compare ? "Hide comparison" : "Compare attempts"}
        </button>
      </div>
      {compare && other && (
        <>
          {candidates.length > 1 && (
            <label className="field">
              Compare with
              <select value={other.key} onChange={(e) => setOtherKey(e.target.value)}>
                {candidates.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <CompareTable a={other.attempt} b={attempt} />
        </>
      )}
    </section>
  );
}

// ---------- Compare ----------

function summary(a: Attempt): [string, string][] {
  const r = a.result;
  const d = a.design;
  const b = r.budget;
  const rows: [string, string][] = [
    ["Seed", String(a.seed)],
    ["Result", r.success ? "Success" : "Failed"],
    ["Score", r.score ? `${r.score.total} (${r.score.stars} stars)` : "-"],
    ...((r.score?.components ?? []).map((c) => [`  ${c.id}`, `${c.points} / ${c.weight * 10}`]) as [string, string][]),
    ["Structure", d.parts.structure?.name ?? "-"],
    ["Instruments", (d.instruments ?? []).map((i) => i.name).join(", ") || "-"],
    ["Launcher", d.launcher?.name ?? "-"],
    ["Orbit", `${b.orbit.altitudeKm} km ${b.orbit.type}`],
    ["Ground stations", b.groundStations.map((g) => g.name).join(", ")],
    ["Mass", `${b.massKg.toFixed(1)} kg`],
    ["Power drawn / produced", `${b.powerDrawnW.toFixed(1)} / ${b.powerProducedW} W`],
    ["Revisits per day", b.revisitsPerDay.toFixed(2)],
    ["Downlink", `${b.downlinkCapacityGbPerDay.toFixed(2)} GB/day`],
    ["Lifetime", `${b.lifetimeYears.toFixed(1)} years`],
    ["Total cost", formatUsd(r.totalCostUsd)],
    ["Ready for launch", `${r.readyMonths} months`],
  ];
  return rows;
}

export function CompareTable({ a, b }: { a: Attempt; b: Attempt }) {
  const left = summary(a);
  const right = summary(b);
  const labels = [...new Set([...left, ...right].map((x) => x[0]))];
  return (
    <table className="compare">
      <thead>
        <tr>
          <th scope="col" />
          <th scope="col">Attempt {a.number}</th>
          <th scope="col">Attempt {b.number}</th>
        </tr>
      </thead>
      <tbody>
        {labels.map((label, i) => {
          const l = left.find((x) => x[0] === label)?.[1] ?? "-";
          const r = right.find((x) => x[0] === label)?.[1] ?? "-";
          return (
            <tr key={label + i} className={l !== r ? "diff" : ""}>
              <th scope="row">{label}</th>
              <td>{l}</td>
              <td>{r}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

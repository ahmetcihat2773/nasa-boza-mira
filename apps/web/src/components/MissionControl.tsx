/**
 * AI Mission Control: two agents fly one mission with one expected problem.
 *   Agent 1 (Mission Designer) designs Wildfire Watch so it can survive a low orbit insertion.
 *   The launch happens, the rocket releases the spacecraft 150 km too low.
 *   Agent 2 (Mission Monitor) spots it in the telemetry, diagnoses it and fires the thruster to fix it.
 * The agents run in the local API (Claude, with a built-in fallback); without the API the built-in
 * agents run here in the browser, so the demo always works.
 */
import {
  AUTOPILOT_SCENARIO,
  applyRecovery,
  autoDesign,
  autopilotMission,
  chooseRecovery,
  describeDesign,
  evaluateDesign,
  formatUsd,
  fromDesignIds,
  launchTelemetry,
  situationFor,
  templateDesign,
  type Design,
  type TelemetryFrame,
} from "@space-mission/sim";
import { orbitTypes } from "@space-mission/data";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { designerAgent, monitorAgent, type DesignerResponse, type MonitorResponse } from "../api.ts";
import type { Maneuver } from "../scene/OrbitView.tsx";

const OrbitView = lazy(() => import("../scene/OrbitView.tsx"));
const LaunchScene = lazy(() => import("../scene/LaunchScene.tsx"));

type Stage = "idle" | "designing" | "designed" | "launching" | "monitoring" | "deciding" | "burning" | "done";

const STAGES: { label: string; stages: Stage[] }[] = [
  { label: "1 · Agent 1 designs", stages: ["idle", "designing", "designed"] },
  { label: "2 · Launch", stages: ["launching"] },
  { label: "3 · Agent 2 monitors and fixes", stages: ["monitoring", "deciding", "burning"] },
  { label: "4 · Result", stages: ["done"] },
];

const FRAME_MS = 900;
/** Slower during the burn, so the climb is easy to follow in the 3D view. */
const BURN_MS = 1500;
const STEP_MS = 1400;

const clock = (tS: number) => {
  const h = Math.floor(tS / 3600);
  const m = Math.floor((tS % 3600) / 60);
  const s = Math.round(tS % 60);
  const mmss = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return h > 0 ? `T+${h}:${mmss}` : `T+${mmss}`;
};

const SOURCE_LABEL: Record<string, string> = {
  claude: "Claude",
  autopilot: "Built-in agent",
  "claude+autopilot": "Claude + built-in agent",
};

/** Agent 1 without the API: the built-in designer, in the browser. */
function localDesigner(): DesignerResponse {
  const steps = autoDesign(templateDesign(), autopilotMission());
  const last = steps[steps.length - 1]!;
  return { source: "autopilot", steps, final: last.ids, pass: last.pass, fallbackReason: "local API not running" };
}

/** Agent 2 without the API: the built-in rule, in the browser. */
function localMonitor(design: Design): MonitorResponse {
  const mission = autopilotMission();
  const situation = situationFor(design, mission);
  const choice = chooseRecovery(situation);
  return {
    source: "autopilot",
    diagnosis: `At stage 2 cut-off the rocket stopped early, and the spacecraft was released at ${situation.actualAltitudeKm} km instead of ${situation.plannedAltitudeKm} km. At that height air drag would bring it down in about ${situation.lifetimeIfNothingYears.toFixed(1)} years, so R4 (at least ${situation.minLifetimeYears} year in orbit) would fail.`,
    optionId: choice.optionId,
    reasoning: choice.reasoning,
    situation,
    outcome: applyRecovery(design, mission, choice.optionId),
    fallbackReason: "local API not running",
  };
}

function AltitudeChart({ frames, plannedKm }: { frames: TelemetryFrame[]; plannedKm: number }) {
  const W = 520;
  const H = 160;
  const maxKm = Math.max(plannedKm, ...frames.map((f) => f.altitudeKm)) * 1.12;
  const n = Math.max(frames.length - 1, 1);
  const x = (i: number) => 30 + (i / n) * (W - 40);
  const y = (km: number) => H - 20 - (km / maxKm) * (H - 30);
  const line = (key: "altitudeKm" | "expectedAltitudeKm") =>
    frames.map((f, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(f[key]).toFixed(1)}`).join(" ");
  return (
    <svg className="mc-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Altitude: measured against planned">
      <line x1="30" x2={W - 10} y1={y(plannedKm)} y2={y(plannedKm)} className="mc-chart-target" />
      <text x="32" y={y(plannedKm) - 4} className="mc-chart-label">
        planned orbit {plannedKm} km
      </text>
      {frames.length > 0 && (
        <>
          <path d={line("expectedAltitudeKm")} className="mc-chart-expected" />
          <path d={line("altitudeKm")} className="mc-chart-actual" />
          {frames.map((f, i) =>
            f.alert ? <circle key={i} cx={x(i)} cy={y(f.altitudeKm)} r="4" className="mc-chart-alert" /> : null,
          )}
        </>
      )}
      <text x="32" y={H - 4} className="mc-chart-label">
        — measured · - - expected
      </text>
    </svg>
  );
}

export function MissionControl({ onExit }: { onExit: () => void }) {
  const mission = useMemo(() => autopilotMission(), []);
  const s = AUTOPILOT_SCENARIO;
  const [stage, setStage] = useState<Stage>("idle");
  const [designer, setDesigner] = useState<DesignerResponse | null>(null);
  const [shownSteps, setShownSteps] = useState(0);
  const [frameIndex, setFrameIndex] = useState(0);
  const [burnIndex, setBurnIndex] = useState(0);
  const [monitor, setMonitor] = useState<MonitorResponse | null>(null);
  const monitorCall = useRef<Promise<MonitorResponse> | null>(null);

  const design = useMemo(() => (designer ? fromDesignIds(designer.final).design : null), [designer]);
  const ev = useMemo(() => (design ? evaluateDesign(design, mission) : null), [design, mission]);
  const frames = useMemo(() => (design ? launchTelemetry(design, mission) : []), [design, mission]);
  const firstAlert = frames.findIndex((f) => f.alert);
  const detected = firstAlert >= 0 && frameIndex > firstAlert;

  // Agent 1: run, then reveal its attempts one by one.
  const startDesign = async () => {
    setStage("designing");
    setShownSteps(0);
    const r = (await designerAgent()) ?? localDesigner();
    setDesigner(r);
    setStage("designed");
  };
  useEffect(() => {
    if (stage !== "designed" || !designer || shownSteps >= designer.steps.length) return;
    const t = setTimeout(() => setShownSteps((n) => n + 1), shownSteps === 0 ? 300 : STEP_MS);
    return () => clearTimeout(t);
  }, [stage, designer, shownSteps]);

  // Launch telemetry streams in; Agent 2 is called the moment the first alert shows.
  useEffect(() => {
    if (stage !== "monitoring") return;
    if (frameIndex >= frames.length) {
      setStage("deciding");
      return;
    }
    const t = setTimeout(() => setFrameIndex((i) => i + 1), FRAME_MS);
    return () => clearTimeout(t);
  }, [stage, frameIndex, frames.length]);
  useEffect(() => {
    if (!detected || monitorCall.current || !designer || !design) return;
    monitorCall.current = monitorAgent(designer.final).then((r) => r ?? localMonitor(design));
  }, [detected, designer, design]);
  useEffect(() => {
    if (stage !== "deciding" || !monitorCall.current) return;
    let live = true;
    void monitorCall.current.then((r) => {
      if (!live) return;
      setMonitor(r);
      setTimeout(() => live && setStage("burning"), 3500);
    });
    return () => {
      live = false;
    };
  }, [stage]);
  useEffect(() => {
    if (stage !== "burning" || !monitor) return;
    if (burnIndex >= monitor.outcome.burn.length) {
      setStage("done");
      return;
    }
    const t = setTimeout(() => setBurnIndex((i) => i + 1), BURN_MS);
    return () => clearTimeout(t);
  }, [stage, burnIndex, monitor]);

  const reset = () => {
    setStage("idle");
    setDesigner(null);
    setMonitor(null);
    setShownSteps(0);
    setFrameIndex(0);
    setBurnIndex(0);
    monitorCall.current = null;
  };

  const shownFrames = [...frames.slice(0, frameIndex), ...(monitor ? monitor.outcome.burn.slice(0, burnIndex) : [])];
  const current = shownFrames[shownFrames.length - 1];
  const plannedKm = ev?.budget.orbit.altitudeKm ?? 525;
  const inOrbit = current && current.tS >= 900;
  // What the 3D view shows: off target → fix chosen → thruster firing → holding the new orbit.
  const maneuverPhase: Maneuver["phase"] =
    stage === "burning" ? "burning" : stage === "done" ? "done" : monitor ? "arming" : "low";
  const targetKm = monitor ? monitor.outcome.option.finalAltitudeKm : plannedKm;
  const maneuver = useMemo<Maneuver>(
    () => ({ phase: maneuverPhase, targetAltitudeKm: targetKm }),
    [maneuverPhase, targetKm],
  );
  const designDone = designer !== null && shownSteps >= designer.steps.length;

  // What would have happened without Agent 1 planning for the risk (same problem, no thruster).
  const without = useMemo(() => {
    const t = templateDesign();
    const sit = situationFor(t, mission);
    return { sit, out: applyRecovery(t, mission, chooseRecovery(sit).optionId) };
  }, [mission]);

  return (
    <div className="app mission-control">
      {stage === "launching" && design && (
        <Suspense fallback={<div className="launch-loading">Preparing launch…</div>}>
          <LaunchScene
            pass
            missionName={mission.name}
            mission={mission}
            design={design}
            reasons={[]}
            onDone={() => setStage("monitoring")}
          />
        </Suspense>
      )}
      <header>
        <div>
          <div className="kicker">AI Mission Control · two agents, one mission</div>
          <h1>{mission.name}</h1>
          <p className="objective">{mission.objective}</p>
        </div>
        <div className="header-tools">
          <button className="ghost" onClick={onExit}>
            Back to the game
          </button>
        </div>
      </header>

      <ol className="mc-stages">
        {STAGES.map((x) => (
          <li key={x.label} className={x.stages.includes(stage) ? "active" : ""}>
            {x.label}
          </li>
        ))}
      </ol>

      <section className="card mc-risk">
        <b>Known risk:</b> {s.anomaly.risk} <span className="muted">{s.anomaly.why}</span>
      </section>

      <div className="mc-grid">
        {/* ---------- Agent 1 ---------- */}
        <section className="card mc-agent">
          <div className="mc-agent-head">
            <span className="mc-avatar" aria-hidden="true">
              A1
            </span>
            <div>
              <h2>Mission Designer</h2>
              <p className="muted small">
                Picks every part so the mission meets R1–R4 and can climb back if the rocket leaves it low (C1).
              </p>
            </div>
            {designer && <span className="mc-badge">{SOURCE_LABEL[designer.source]}</span>}
          </div>

          {stage === "idle" && (
            <button className="launch" onClick={() => void startDesign()}>
              Start Agent 1: design the mission
            </button>
          )}
          {stage === "designing" && (
            <p className="mc-thinking">
              Designing… checking parts against the requirements (Claude can take a minute).
            </p>
          )}

          <ol className="mc-steps">
            {designer?.steps.slice(0, shownSteps).map((st) => (
              <li key={st.attempt} className={st.pass ? "ok" : "bad"}>
                <div className="mc-step-head">
                  <b>Attempt {st.attempt}</b>
                  <span className="muted small">
                    {SOURCE_LABEL[st.source]} · {formatUsd(st.totalCostUsd)}
                  </span>
                  <span className={`val ${st.pass ? "ok" : "bad"}`}>
                    {st.pass
                      ? "all checks pass"
                      : `${st.failures.length} check${st.failures.length > 1 ? "s" : ""} failed`}
                  </span>
                </div>
                <p>{st.note}</p>
                {st.reasoning && <p className="mc-quote">“{st.reasoning}”</p>}
                {st.failures.map((f) => (
                  <p key={f.id + f.message} className="small bad">
                    ✗ {f.message}
                  </p>
                ))}
              </li>
            ))}
          </ol>

          {designDone && design && ev && (
            <>
              <h3>Final design</h3>
              <ul className="mc-design">
                {describeDesign(design).map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
              <div className="mc-facts">
                <span>
                  Mass <b>{ev.budget.massKg.toFixed(1)} kg</b>
                </span>
                <span>
                  Power{" "}
                  <b>
                    {ev.budget.powerDrawnW.toFixed(0)} / {ev.budget.powerProducedW} W
                  </b>
                </span>
                <span>
                  Cost <b>{formatUsd(ev.budget.totalCostUsd)}</b> of {formatUsd(mission.budgetUsd)}
                </span>
                <span>
                  Ready <b>{ev.budget.deadline.readyMonths} months</b> of {mission.deadlineMonths}
                </span>
                <span>
                  Thruster <b>{ev.recovery.availableMs.toFixed(0)} m/s</b> (needs {ev.recovery.requiredMs.toFixed(0)})
                </span>
              </div>
              <ul className="mc-checks">
                {ev.checks
                  .filter((c) => /^(R\d|C1)$/.test(c.id))
                  .map((c) => (
                    <li key={c.id} className={c.ok ? "ok" : "bad"}>
                      {c.ok ? "✓" : "✗"} {c.message}
                    </li>
                  ))}
              </ul>
              {stage === "designed" && (
                <button className="launch" disabled={!ev.pass} onClick={() => setStage("launching")}>
                  Go for launch
                </button>
              )}
            </>
          )}
        </section>

        {/* ---------- Agent 2 ---------- */}
        <section className="card mc-agent">
          <div className="mc-agent-head">
            <span className="mc-avatar a2" aria-hidden="true">
              A2
            </span>
            <div>
              <h2>Mission Monitor</h2>
              <p className="muted small">Watches the launch telemetry, finds what went wrong and decides the fix.</p>
            </div>
            {monitor && <span className="mc-badge">{SOURCE_LABEL[monitor.source]}</span>}
          </div>

          {["idle", "designing", "designed", "launching"].includes(stage) && (
            <p className="muted">Waiting for the launch…</p>
          )}

          {inOrbit && ev && (
            <Suspense fallback={<div className="orbit-view scene-loading">Loading orbit view…</div>}>
              <OrbitView
                orbit={{ ...ev.budget.orbit, altitudeKm: current!.altitudeKm }}
                orbitName={orbitTypes.find((o) => o.id === ev.budget.orbit.type)?.name ?? ev.budget.orbit.type}
                swathKm={ev.budget.swathKm}
                stations={ev.budget.groundStations}
                design={design ?? undefined}
                maneuver={maneuver}
                live
              />
            </Suspense>
          )}

          {shownFrames.length > 0 && (
            <>
              <AltitudeChart frames={shownFrames} plannedKm={plannedKm} />
              <div className="mc-telemetry" role="log" aria-live="polite">
                {shownFrames
                  .slice()
                  .reverse()
                  .map((f) => (
                    <div key={f.tS} className={f.alert ? "alert" : ""}>
                      <span className="mono">{clock(f.tS)}</span>
                      <span>{f.label}</span>
                      <span className="mono">
                        {f.altitudeKm} km
                        {f.expectedAltitudeKm !== f.altitudeKm ? ` (plan ${f.expectedAltitudeKm})` : ""}
                      </span>
                      <span className="mono">{f.speedKmS} km/s</span>
                      <span className="mono">fuel {f.propellantPct}%</span>
                    </div>
                  ))}
              </div>
            </>
          )}

          {detected && (
            <p className="mc-alarm">
              ⚠ Anomaly detected at {clock(frames[firstAlert]!.tS)}: {frames[firstAlert]!.alert}
            </p>
          )}
          {stage === "deciding" && !monitor && <p className="mc-thinking">Diagnosing and choosing a fix…</p>}

          {monitor && (
            <>
              <h3>Diagnosis</h3>
              <p className="mc-quote">“{monitor.diagnosis}”</p>
              <h3>Options</h3>
              <table className="mc-options">
                <thead>
                  <tr>
                    <th>Option</th>
                    <th>Delta-v</th>
                    <th>Fuel</th>
                    <th>Lifetime</th>
                  </tr>
                </thead>
                <tbody>
                  {monitor.situation.options.map((o) => (
                    <tr key={o.id} className={o.id === monitor.optionId ? "chosen" : ""}>
                      <td>
                        {o.id === monitor.optionId ? "▶ " : ""}
                        {o.label}
                      </td>
                      <td className="mono">{o.deltaVMs.toFixed(0)} m/s</td>
                      <td className="mono">
                        {Number.isFinite(o.propellantUsePct) ? `${o.propellantUsePct.toFixed(0)}%` : "–"}
                      </td>
                      <td className={`mono ${o.meetsLifetime ? "ok" : "bad"}`}>
                        {o.lifetimeYears >= 50 ? "50+" : o.lifetimeYears.toFixed(1)} yr
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p>
                <b>Decision:</b> {monitor.reasoning}
              </p>
            </>
          )}
          {stage === "burning" && <p className="mc-thinking">Firing the thruster…</p>}
        </section>
      </div>

      {stage === "done" && monitor && (
        <section className={`card mc-result ${monitor.outcome.lifetimeMet ? "saved" : "lost"}`}>
          <h2 className={monitor.outcome.lifetimeMet ? "ok" : "bad"}>
            {monitor.outcome.lifetimeMet ? "Mission saved" : "Mission lost"}
          </h2>
          <p>{monitor.outcome.summary}</p>
          <p className="muted">
            Why it worked: Agent 1 knew about the risk and paid for a thruster (C1). Agent 2 found the problem{" "}
            {clock(frames[firstAlert]!.tS)} after lift-off and used {monitor.outcome.option.propellantUsePct.toFixed(0)}
            % of the propellant to fix it.
          </p>
          <h3 className="warn">Without Agent 1&apos;s planning</h3>
          <p className="muted">
            The cheaper template design has no thruster. With the same launch problem, the monitor can only watch:{" "}
            {without.out.summary}
          </p>
          <div className="actions">
            <button className="launch" onClick={reset}>
              Run again
            </button>
            <button className="ghost" onClick={onExit}>
              Back to the game
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

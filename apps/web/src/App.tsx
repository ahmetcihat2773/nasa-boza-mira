import { orbitTypes } from "@space-mission/data";
import { WILDFIRE_WATCH, computeBudget, formatUsd, runMission, type MissionResult } from "@space-mission/sim";
import { lazy, Suspense, useCallback, useMemo, useState } from "react";
import "./components/components.css";
import {
  ApprovalScreen,
  BriefingScreen,
  EventsScreen,
  PhaseStepper,
  ResultsScreen,
  SetupScreen,
} from "./components/Flow.tsx";
import { Tour } from "./components/Tour.tsx";
import { recordRun, useFlow } from "./flow.ts";
import { GlossaryButton, Term } from "./components/Glossary.tsx";
import { Meter } from "./components/Meter.tsx";
import { RequirementsPanel } from "./components/Requirements.tsx";
import { ROLES, RoleBudget, RoleTabs } from "./components/RoleTabs.tsx";
import { useGame } from "./store.ts";
import { adjustedMission, coordinationOf, useTeam } from "./team.ts";

// The 3D scenes load on demand so the design screen appears quickly.
const OrbitView = lazy(() => import("./scene/OrbitView.tsx"));
const LaunchScene = lazy(() => import("./scene/LaunchScene.tsx"));

const baseMission = WILDFIRE_WATCH;

export function App() {
  const design = useGame((s) => s.design);
  const launch = useGame((s) => s.launch);
  const [flying, setFlying] = useState(false);
  const reset = useGame((s) => s.reset);
  // Team play (T20): accepted budget requests and trades move allocations between roles.
  const requests = useTeam((s) => s.requests);
  const mission = useMemo(() => adjustedMission(baseMission, requests), [requests]);
  const b = computeBudget(design, mission);
  const failed = b.checks.filter((c) => !c.ok && c.blocking);

  // Game flow (T19): phases, events, the run and its attempts.
  const phase = useFlow((s) => s.phase);
  const nickname = useFlow((s) => s.nickname);
  const goTo = useFlow((s) => s.goTo);
  const seed = useFlow((s) => s.seed);
  const decisions = useFlow((s) => s.decisions);
  const attempts = useFlow((s) => s.attempts);
  /** The run as it stands at the launch (decisions so far), for the launch outcome. */
  const [launchRun, setLaunchRun] = useState<MissionResult | null>(null);
  const finish = () => {
    recordRun(
      mission.id,
      design,
      runMission(design, mission, seed, decisions, coordinationOf(requests, computeBudget(design, mission))),
    );
  };
  const startLaunch = () => {
    setLaunchRun(
      runMission(design, mission, seed, decisions, coordinationOf(requests, computeBudget(design, mission))),
    );
    launch();
    setFlying(true);
  };
  // After the launch sequence: operations when the satellite reached orbit, else the results.
  const endLaunch = useCallback(() => {
    setFlying(false);
    if (launchRun?.launch?.ok) goTo("operations");
    else
      recordRun(
        mission.id,
        design,
        runMission(design, mission, seed, decisions, coordinationOf(requests, computeBudget(design, mission))),
      );
  }, [launchRun, design, seed, decisions, goTo, mission, requests]);
  const orbitName = orbitTypes.find((o) => o.id === b.orbit.type)?.name ?? b.orbit.type;

  return (
    <div className="app">
      {flying && (
        <Suspense fallback={<div className="launch-loading">Preparing launch…</div>}>
          <LaunchScene
            pass={launchRun?.launch?.ok ?? false}
            missionName={mission.name}
            design={design}
            failure={b.pass ? "anomaly" : "scrub"}
            reasons={b.pass ? (launchRun?.failureReasons ?? []) : failed.map((c) => c.message)}
            onDone={endLaunch}
          />
        </Suspense>
      )}
      <header>
        <div data-tour="mission-card">
          <div className="kicker">Mission control · {nickname || "New game"}</div>
          <h1>{mission.name}</h1>
          <p className="objective">{mission.objective}</p>
        </div>
        <div className="header-tools">
          <GlossaryButton />
          <div className="constraints">
            <div>
              Budget <b>{formatUsd(mission.budgetUsd)}</b>
            </div>
            <div>
              <Term id="deadline" focusable>
                Deadline
              </Term>{" "}
              <b>{mission.deadlineMonths} months</b>
            </div>
          </div>
        </div>
      </header>
      <PhaseStepper phase={phase} />

      {phase === "setup" && <SetupScreen />}
      {phase === "briefing" && <BriefingScreen mission={mission} />}
      {phase === "approval" && <ApprovalScreen b={b} onApprove={() => goTo(b.pass ? "development" : "launch")} />}
      {phase === "development" && (
        <EventsScreen
          phase="development"
          design={design}
          b={b}
          mission={mission}
          continueLabel="Ship it to the launch site"
          onContinue={(lost) => (lost ? finish() : goTo("launch"))}
        />
      )}
      {phase === "launch" && (
        <EventsScreen
          phase="launch"
          design={design}
          b={b}
          mission={mission}
          continueLabel="Go for launch"
          vote="Go / No-Go for launch?"
          onContinue={(lost) => (lost ? finish() : startLaunch())}
        />
      )}
      {phase === "operations" && (
        <EventsScreen
          phase="operations"
          design={design}
          b={b}
          mission={mission}
          continueLabel="End the mission and see the results"
          onContinue={finish}
        >
          <Suspense fallback={<div className="orbit-view scene-loading">Loading orbit view…</div>}>
            <OrbitView orbit={b.orbit} orbitName={orbitName} swathKm={b.swathKm} stations={b.groundStations} live />
          </Suspense>
        </EventsScreen>
      )}
      {phase === "results" && attempts.length > 0 && (
        <ResultsScreen
          mission={mission}
          attempt={attempts[attempts.length - 1]!}
          previous={attempts[attempts.length - 2]}
        />
      )}

      {phase === "design" && <Tour />}
      {phase === "design" && (
        <main>
          <RoleTabs b={b} mission={mission} />

          <aside className="dashboard" data-tour="dashboard">
            <h2>Live dashboard</h2>
            <Suspense fallback={<div className="orbit-view scene-loading">Loading orbit view…</div>}>
              <OrbitView
                orbit={b.orbit}
                orbitName={orbitName}
                swathKm={b.swathKm}
                stations={b.groundStations}
                live={false}
              />
            </Suspense>
            <Meter
              label="Mass vs structure limit"
              value={`${b.massKg.toFixed(1)} / ${b.maxMassKg ?? "-"} kg`}
              used={b.massKg}
              limit={b.maxMassKg ?? 0}
              lvl={b.maxMassKg === null ? "warn" : undefined}
            />
            <Meter
              label={`Mass vs launcher capacity (${orbitName})`}
              value={`${b.massKg.toFixed(1)} / ${b.launcherCapacityKg ?? "-"} kg`}
              used={b.massKg}
              limit={b.launcherCapacityKg ?? 0}
              lvl={b.launcherCapacityKg === null ? "warn" : undefined}
            />
            <Meter
              label="Power drawn vs produced"
              value={`${b.powerDrawnW.toFixed(1)} / ${b.powerProducedW} W`}
              used={b.powerDrawnW}
              limit={b.powerProducedW}
              lvl={b.powerProducedW === 0 ? "bad" : undefined}
            />
            <Meter
              label="Budget used"
              value={`${formatUsd(b.totalCostUsd)} / ${formatUsd(mission.budgetUsd)}`}
              used={b.totalCostUsd}
              limit={mission.budgetUsd}
            />
            <Meter
              label="Ready for launch"
              value={`${b.deadline.readyMonths} / ${mission.deadlineMonths} months`}
              used={b.deadline.readyMonths}
              limit={mission.deadlineMonths}
            />
            <p className="muted small">
              Development {b.devMonths} months
              {b.deadline.waitMonths > 0 ? ` + ${b.deadline.waitMonths} months waiting for the next launch window` : ""}
              .
            </p>

            <h3>Budget by role</h3>
            {ROLES.map((r) => (
              <RoleBudget key={r.id} role={r.id} label={r.label} b={b} mission={mission} />
            ))}
            <p className="muted small">
              <Term id="team-cost" focusable>
                Team cost
              </Term>
              : {b.deadline.readyMonths} months x {formatUsd(mission.teamCostPerMonthUsd)} = {formatUsd(b.teamCostUsd)},
              split over the roles by their budget allocation.
            </p>

            <RequirementsPanel b={b} />

            <div className="actions">
              <button className="launch" data-tour="approve-button" onClick={() => goTo("approval")}>
                Submit for design approval
              </button>
              <button className="ghost" onClick={reset}>
                Reset
              </button>
            </div>
          </aside>
        </main>
      )}
    </div>
  );
}

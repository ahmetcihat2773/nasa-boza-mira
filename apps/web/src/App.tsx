import { orbitTypes } from "@space-mission/data";
import { computeBudget, formatUsd, runMission, type MissionResult } from "@space-mission/sim";
import { lazy, Suspense, useCallback, useMemo, useState } from "react";
import "./components/components.css";
import {
  ApprovalScreen,
  BriefingScreen,
  EventsScreen,
  MissionSelectScreen,
  PhaseStepper,
  ResultsScreen,
  SetupScreen,
} from "./components/Flow.tsx";
import { Tour } from "./components/Tour.tsx";
import { recordRun, useFlow } from "./flow.ts";
import { GlossaryButton, Term } from "./components/Glossary.tsx";
import { Meter } from "./components/Meter.tsx";
import { MissionControl } from "./components/MissionControl.tsx";
import { RequirementsPanel } from "./components/Requirements.tsx";
import { ROLES, RoleBudget, RoleTabs } from "./components/RoleTabs.tsx";
import { destinationOf, missionById, starterDesign, transferMeters } from "./missions.ts";
import { useGame } from "./store.ts";
import { adjustedMission, coordinationOf, useTeam } from "./team.ts";

// The 3D scenes load on demand so the design screen appears quickly.
const OrbitView = lazy(() => import("./scene/OrbitView.tsx"));
const LaunchScene = lazy(() => import("./scene/LaunchScene.tsx"));

export function App() {
  const design = useGame((s) => s.design);
  const launch = useGame((s) => s.launch);
  const [flying, setFlying] = useState(false);
  const reset = useGame((s) => s.reset);
  // Team play (T20): accepted budget requests and trades move allocations between roles.
  const requests = useTeam((s) => s.requests);
  // The chosen mission (T28): Wildfire Watch until the player picks another card.
  const missionId = useFlow((s) => s.missionId);
  const mission = useMemo(() => adjustedMission(missionById(missionId), requests), [missionId, requests]);
  const destination = destinationOf(mission.card);
  const lunar = destination === "lunar-orbit";
  const b = computeBudget(design, mission);
  const failed = b.checks.filter((c) => !c.ok && c.blocking);
  const transfer = transferMeters(b);

  // Game flow (T19): phases, events, the run and its attempts.
  const phase = useFlow((s) => s.phase);
  const nickname = useFlow((s) => s.nickname);
  const goTo = useFlow((s) => s.goTo);
  const seed = useFlow((s) => s.seed);
  const decisions = useFlow((s) => s.decisions);
  const allAttempts = useFlow((s) => s.attempts);
  // Results, retries and comparisons stay within the chosen mission (design.md section 10.5).
  const attempts = useMemo(() => allAttempts.filter((a) => a.missionId === missionId), [allAttempts, missionId]);
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
  // AI Mission Control: two agents design and fly the mission (a separate screen).
  const [missionControl, setMissionControl] = useState(false);
  if (missionControl) return <MissionControl onExit={() => setMissionControl(false)} />;

  return (
    <div className="app">
      {flying && (
        <Suspense fallback={<div className="launch-loading">Preparing launch…</div>}>
          <LaunchScene
            pass={launchRun?.launch?.ok ?? false}
            missionName={mission.name}
            mission={mission}
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
          <button className="ghost mc-open" onClick={() => setMissionControl(true)}>
            AI Mission Control
          </button>
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
      {phase === "mission" && <MissionSelectScreen />}
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
            <OrbitView
              orbit={b.orbit}
              orbitName={orbitName}
              swathKm={b.swathKm}
              stations={b.groundStations}
              design={design}
              destination={destination}
              live
            />
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
                design={design}
                destination={destination}
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
              label={lunar ? "Mass vs launcher capacity to the Moon" : `Mass vs launcher capacity (${orbitName})`}
              value={`${b.massKg.toFixed(1)} / ${b.launcherCapacityKg ?? "-"} kg`}
              used={b.massKg}
              limit={b.launcherCapacityKg ?? 0}
              lvl={b.launcherCapacityKg === null ? "warn" : undefined}
            />
            {transfer && (
              <>
                <Meter
                  label="Delta-v needed vs available"
                  value={`${transfer.neededKmS.toFixed(2)} / ${transfer.availableKmS.toFixed(2)} km/s`}
                  used={transfer.neededKmS}
                  limit={transfer.availableKmS}
                  lvl={transfer.availableKmS === 0 ? "bad" : undefined}
                />
                <p className="muted small">
                  <Term id="delta-v" focusable>
                    Delta-v
                  </Term>{" "}
                  for lunar orbit insertion and station-keeping; the thruster needs {transfer.propellantKg.toFixed(1)}{" "}
                  kg of propellant, counted in the mass above.
                </p>
              </>
            )}
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
              <button className="ghost" onClick={() => reset(starterDesign(mission))}>
                Reset to starter
              </button>
            </div>
          </aside>
        </main>
      )}
    </div>
  );
}

import { launchers, parts, type Subsystem } from "@space-mission/data";
import {
  SUBSYSTEMS,
  WILDFIRE_WATCH,
  computeBudget,
  formatUsd,
  trlPenaltyMonths,
  type BudgetRole,
} from "@space-mission/sim";
import { useEffect, useState } from "react";
import { launcherLockReason, partFits, partLockReason } from "./lock.ts";
import { useGame } from "./store.ts";

/** Full-screen launch sequence: the rocket lifts off on PASS, or the launch is scrubbed on FAIL. */
function LaunchSequence({ pass, onDone }: { pass: boolean; onDone: () => void }) {
  const [count, setCount] = useState(3);
  useEffect(() => {
    if (count > 0) {
      const t = setTimeout(() => setCount(count - 1), 700);
      return () => clearTimeout(t);
    }
    const t = setTimeout(onDone, pass ? 3200 : 2200);
    return () => clearTimeout(t);
  }, [count, pass, onDone]);

  const ignition = count === 0;
  return (
    <div className="launch-overlay" onClick={onDone} role="dialog" aria-label="Launch sequence">
      <div className="stars" />
      <div className={`rocket ${ignition ? (pass ? "liftoff" : "scrub") : ""}`} aria-hidden="true">
        <svg viewBox="0 0 60 160" width="60" height="160">
          <path d="M30 4 C46 24 48 60 46 104 L14 104 C12 60 14 24 30 4 Z" fill="#e8ecf4" stroke="#9aa6bd" />
          <circle cx="30" cy="48" r="8" fill="#3aa0ff" stroke="#1d5f99" strokeWidth="2" />
          <path d="M14 84 L2 112 L14 106 Z M46 84 L58 112 L46 106 Z" fill="#ff5a4e" />
          <rect x="20" y="104" width="20" height="8" fill="#9aa6bd" />
        </svg>
        {ignition && pass && <div className="flame" />}
      </div>
      <div className="pad" />
      <div className="launch-text">
        {!ignition && <span className="countdown">T-{count}</span>}
        {ignition && pass && <span className="go">Liftoff! Wildfire Watch is on its way to orbit</span>}
        {ignition && !pass && <span className="nogo">Launch scrubbed: the design review did not pass</span>}
      </div>
      <div className="muted small skip">Click to skip</div>
    </div>
  );
}

const mission = WILDFIRE_WATCH;

const LABELS: Record<Subsystem, string> = {
  structure: "Structure",
  solar: "Solar panels",
  battery: "Battery",
  obc: "On-board computer",
  adcs: "Attitude control",
  propulsion: "Propulsion",
  comms: "Communications",
};
const ROLES: { id: BudgetRole; label: string }[] = [
  { id: "launch", label: "Launch" },
  { id: "spacecraft", label: "Spacecraft" },
  { id: "science", label: "Science" },
  { id: "ground", label: "Ground" },
];

type Level = "ok" | "warn" | "bad";
/** Green below 85 % of the limit, amber up to 100 %, red above. */
const level = (used: number, limit: number): Level => (used > limit ? "bad" : used > 0.85 * limit ? "warn" : "ok");

function Meter(props: { label: string; value: string; used: number; limit: number; lvl?: Level | undefined }) {
  const lvl = props.lvl ?? level(props.used, props.limit);
  const pct = props.limit > 0 ? Math.min(100, (props.used / props.limit) * 100) : 0;
  return (
    <div className="meter">
      <div className="meter-head">
        <span>{props.label}</span>
        <span className={`val ${lvl}`}>{props.value}</span>
      </div>
      <div className="bar">
        <div className={`fill ${lvl}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function PartPicker({ subsystem }: { subsystem: Subsystem }) {
  const design = useGame((s) => s.design);
  const pickPart = useGame((s) => s.pickPart);
  const size = design.parts.structure?.fits[0];
  const chosen = design.parts[subsystem];
  const isStructure = subsystem === "structure";
  const options = parts.filter((p) => p.subsystem === subsystem && (isStructure || partFits(p, size)));

  return (
    <section className="picker">
      <h3>
        {LABELS[subsystem]}
        {isStructure && size && <span className="tag">{size}</span>}
      </h3>
      {!isStructure && !size ? (
        <p className="muted">Choose a structure first: it sets the spacecraft size.</p>
      ) : (
        <ul>
          {options.map((p) => {
            const lock = partLockReason(p);
            const penalty = trlPenaltyMonths(p.trl);
            const active = chosen?.id === p.id;
            const power = p.powerProducedW ? `+${p.powerProducedW} W produced` : `${p.powerW} W drawn`;
            return (
              <li key={p.id}>
                <button
                  className={`option ${active ? "active" : ""}`}
                  disabled={lock !== null}
                  onClick={() => pickPart(subsystem, active ? undefined : p)}
                >
                  <span className="name">{p.name}</span>
                  <span className="perf">
                    {p.performance.label}: {p.performance.value} {p.performance.unit}
                  </span>
                  <span className="delta">
                    +{p.massKg} kg · {power} · +{formatUsd(p.costUsd)} · TRL {p.trl}
                    {penalty ? ` (+${penalty} months)` : ""}
                  </span>
                  {lock && <span className="lock">Locked: {lock}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function LauncherPicker({ massKg }: { massKg: number }) {
  const chosen = useGame((s) => s.design.launcher);
  const pickLauncher = useGame((s) => s.pickLauncher);
  return (
    <section className="picker">
      <h3>Launcher</h3>
      <ul>
        {launchers.map((l) => {
          const lock = launcherLockReason(l, massKg, mission);
          const active = chosen?.id === l.id;
          const perKg =
            l.costPerKgUsd && l.includedKg ? ` up to ${l.includedKg} kg, then $${l.costPerKgUsd / 1000}k/kg` : "";
          return (
            <li key={String(l.id)}>
              <button
                className={`option ${active ? "active" : ""}`}
                disabled={lock !== null}
                onClick={() => pickLauncher(active ? undefined : l)}
              >
                <span className="name">{l.name}</span>
                <span className="delta">
                  {formatUsd(l.launchCostUsd)}
                  {perKg} · SSO capacity {l.ssoCapacityKg} kg
                </span>
                {lock && <span className="lock">Locked: {lock}</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function App() {
  const design = useGame((s) => s.design);
  const launched = useGame((s) => s.launched);
  const launch = useGame((s) => s.launch);
  const [flying, setFlying] = useState(false);
  const reset = useGame((s) => s.reset);
  const b = computeBudget(design, mission);
  const failed = b.checks.filter((c) => !c.ok);
  // The team works on the spacecraft, so its salaries count against the spacecraft allocation.
  const spend: Record<BudgetRole, number> = { ...b.costByRole, spacecraft: b.costByRole.spacecraft + b.teamCostUsd };

  return (
    <div className="app">
      {flying && <LaunchSequence pass={b.pass} onDone={() => setFlying(false)} />}
      <header>
        <div>
          <div className="kicker">Mission control · Design review</div>
          <h1>{mission.name}</h1>
          <p className="objective">{mission.objective}</p>
        </div>
        <div className="constraints">
          <div>
            Budget <b>{formatUsd(mission.budgetUsd)}</b>
          </div>
          <div>
            Deadline <b>{mission.deadlineMonths} months</b>
          </div>
        </div>
      </header>

      <main>
        <div className="pickers">
          {SUBSYSTEMS.map((s) => (
            <PartPicker key={s} subsystem={s} />
          ))}
          <LauncherPicker massKg={b.massKg} />
        </div>

        <aside className="dashboard">
          <h2>Live dashboard</h2>
          <Meter
            label="Mass vs structure limit"
            value={`${b.massKg.toFixed(1)} / ${b.maxMassKg ?? "-"} kg`}
            used={b.massKg}
            limit={b.maxMassKg ?? 0}
            lvl={b.maxMassKg === null ? "warn" : undefined}
          />
          <Meter
            label="Mass vs launcher capacity (SSO)"
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
            label="Development time"
            value={`${b.devMonths} / ${mission.deadlineMonths} months`}
            used={b.devMonths}
            limit={mission.deadlineMonths}
          />

          <h3>Budget by role</h3>
          {ROLES.map((r) => (
            <Meter
              key={r.id}
              label={`${r.label} (${mission.allocationsPct[r.id]}%)${r.id === "spacecraft" ? " incl. team" : ""}`}
              value={`${formatUsd(spend[r.id])} / ${formatUsd(b.allocationByRole[r.id])}`}
              used={spend[r.id]}
              limit={b.allocationByRole[r.id]}
            />
          ))}
          <p className="muted small">
            Team cost: {b.devMonths} months x $0.2M = {formatUsd(b.teamCostUsd)}
          </p>

          <div className="actions">
            <button
              className="launch"
              onClick={() => {
                launch();
                setFlying(true);
              }}
            >
              Launch
            </button>
            <button className="ghost" onClick={reset}>
              Reset
            </button>
          </div>

          {launched && (
            <div className={`result ${b.pass ? "pass" : "fail"}`}>
              <div className="verdict">
                {b.pass ? "PASS: mission ready for launch" : "FAIL: design review not passed"}
              </div>
              <ul>
                {(b.pass ? b.checks : failed).map((c) => (
                  <li key={c.id}>{c.message}</li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </main>
    </div>
  );
}

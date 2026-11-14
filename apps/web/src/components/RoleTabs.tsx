import { parts, type Subsystem } from "@space-mission/data";
import { SUBSYSTEMS, formatUsd, type Budget, type BudgetRole, type Mission } from "@space-mission/sim";
import { useState, type ReactNode } from "react";
import { useGame } from "../store.ts";
import { ROLE_LABEL, ROLE_ORDER, ownerOf, useTeam } from "../team.ts";
import { AdvisorPanel, RequestsPanel, TurnBar, useActiveRoles, type Prefill } from "./Team.tsx";
import { Term } from "./Glossary.tsx";
import { Meter } from "./Meter.tsx";
import { GroundPicker, InstrumentPicker, LauncherPicker, OrbitPicker, PartPicker } from "./Pickers.tsx";

const fmtPct = (x: number) => String(Math.round(x * 10) / 10);

export const ROLES: { id: BudgetRole; label: string }[] = [
  { id: "launch", label: "Launch" },
  { id: "spacecraft", label: "Spacecraft" },
  { id: "ground", label: "Ground" },
  { id: "science", label: "Science" },
];

/** Subsystems whose parts belong to a role (from the parts data: comms parts are Ground's). */
const subsystemsOf = (role: BudgetRole): Subsystem[] =>
  SUBSYSTEMS.filter((s) => parts.find((p) => p.subsystem === s)?.role === role);

/** The role's spending (parts plus its share of the team cost) against its budget allocation. */
export function RoleBudget({
  role,
  label,
  b,
  mission,
}: {
  role: BudgetRole;
  label: ReactNode;
  b: Budget;
  mission: Mission;
}) {
  return (
    <Meter
      label={
        <>
          {label} ({fmtPct(mission.allocationsPct[role])}%)
        </>
      }
      value={`${formatUsd(b.spendByRole[role])} / ${formatUsd(b.allocationByRole[role])}`}
      used={b.spendByRole[role]}
      limit={b.allocationByRole[role]}
    />
  );
}

export function RoleTabs({ b, mission }: { b: Budget; mission: Mission }) {
  const [tab, setTab] = useState<BudgetRole>(() => {
    const t = useTeam.getState();
    return t.mode === "team" ? ROLE_ORDER[t.turn]! : "spacecraft";
  });
  const design = useGame((s) => s.design);
  const mode = useTeam((s) => s.mode);
  const players = useTeam((s) => s.players);
  const turn = useTeam((s) => s.turn);
  const active = useActiveRoles();
  const [prefill, setPrefill] = useState<Prefill | undefined>(undefined);
  // Team play: follow the turn to the role that is up next.
  const turnRole = ROLE_ORDER[turn]!;
  const [seenTurn, setSeenTurn] = useState(turn);
  if (mode === "team" && seenTurn !== turn) {
    setSeenTurn(turn);
    setTab(turnRole);
  }
  const canAct = active.includes(tab);
  // In team play, requests come from the role whose turn it is (or the tab, if that player also owns it).
  const requestRole = mode === "team" ? (canAct ? tab : turnRole) : tab;

  const panel: Record<BudgetRole, ReactNode> = {
    launch: (
      <>
        <LauncherPicker b={b} mission={mission} />
        <OrbitPicker b={b} />
      </>
    ),
    spacecraft: subsystemsOf("spacecraft").map((s) => <PartPicker key={s} subsystem={s} />),
    ground: (
      <>
        {subsystemsOf("ground").map((s) => (
          <PartPicker key={s} subsystem={s} />
        ))}
        <GroundPicker b={b} />
      </>
    ),
    science: (
      <>
        {subsystemsOf("science").map((s) => (
          <PartPicker key={s} subsystem={s} />
        ))}
        <InstrumentPicker b={b} />
      </>
    ),
  };

  return (
    <div className="role-tabs" data-tour="role-tabs">
      <TurnBar />
      <div className="tablist" role="tablist" aria-label="Roles">
        {ROLES.map((r) => (
          <button
            key={r.id}
            role="tab"
            id={`tab-${r.id}`}
            aria-selected={tab === r.id}
            aria-controls={`panel-${r.id}`}
            className={`tab ${tab === r.id ? "active" : ""}`}
            onClick={() => setTab(r.id)}
          >
            {r.label}
            {mode === "team" && <span className="tab-owner"> · {ownerOf(players, r.id)?.nickname}</span>}
            <span className="tab-pct">{fmtPct(mission.allocationsPct[r.id])}%</span>
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="tabpanel">
        <div className="role-budget">
          <RoleBudget
            role={tab}
            b={b}
            mission={mission}
            label={
              <>
                {ROLES.find((r) => r.id === tab)?.label} spending vs <Term id="allocation">allocation</Term>
              </>
            }
          />
        </div>
        <AdvisorPanel role={tab} b={b} design={design} mission={mission} onSuggest={setPrefill} />
        {!canAct && (
          <p className="muted">
            Only {ownerOf(players, tab)?.nickname ?? "its player"} can change the {ROLE_LABEL[tab]} choices. You can
            look, or send a request.
          </p>
        )}
        <fieldset className="pickers plain-fieldset" data-tour="part-picker" disabled={!canAct}>
          {panel[tab]}
        </fieldset>
        <RequestsPanel role={requestRole} design={design} mission={mission} prefill={prefill} />
      </div>
    </div>
  );
}

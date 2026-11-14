import { advisorLines } from "@space-mission/data";
import {
  formatUsd,
  trlPenaltyMonths,
  type Budget,
  type BudgetRole,
  type Design,
  type Mission,
} from "@space-mission/sim";
import { useState } from "react";
import {
  PROVIDER,
  ROLE_LABEL,
  ROLE_ORDER,
  UNIT,
  knockOn,
  ownerOf,
  useTeam,
  votersOf,
  type RequestKind,
  type TeamRequest,
} from "../team.ts";

/** "Science – Alex" (team) or just "Science" (solo). */
export function useWho() {
  const mode = useTeam((s) => s.mode);
  const players = useTeam((s) => s.players);
  return (role: BudgetRole | null) => {
    const label = role ? ROLE_LABEL[role] : "Team";
    const owner = ownerOf(players, role);
    return mode === "team" && owner ? `${label} – ${owner.nickname}` : label;
  };
}

// ---------- Turns ----------

/** Team mode: the role that is up next. Players act only for their own roles. */
export function TurnBar() {
  const mode = useTeam((s) => s.mode);
  const turn = useTeam((s) => s.turn);
  const endTurn = useTeam((s) => s.endTurn);
  const who = useWho();
  if (mode !== "team") return null;
  const role = ROLE_ORDER[turn]!;
  const next = ROLE_ORDER[(turn + 1) % ROLE_ORDER.length]!;
  return (
    <div className="turn-bar" role="status" aria-live="polite">
      <span>
        Up next: <b>{who(role)}</b>
      </span>
      <button className="ghost" onClick={endTurn}>
        End turn → {who(next)}
      </button>
    </div>
  );
}

/** The roles the player whose turn it is may act for (all roles in solo play). */
export function useActiveRoles(): BudgetRole[] {
  const mode = useTeam((s) => s.mode);
  const turn = useTeam((s) => s.turn);
  const players = useTeam((s) => s.players);
  if (mode === "solo") return [...ROLE_ORDER];
  return ownerOf(players, ROLE_ORDER[turn])?.roles ?? [];
}

// ---------- Voting in turn ----------

/** Each role votes in turn, hidden; the result is revealed together. Solo: one confirmation. */
export function VotePanel(props: {
  question: string;
  yesLabel: string;
  noLabel: string;
  onResult: (yes: boolean) => void;
}) {
  const mode = useTeam((s) => s.mode);
  const who = useWho();
  const [votes, setVotes] = useState<boolean[]>([]);
  if (mode === "solo") {
    return (
      <div className="actions">
        <button className="ghost" onClick={() => props.onResult(false)}>
          {props.noLabel}
        </button>
        <button className="launch" onClick={() => props.onResult(true)}>
          {props.yesLabel}
        </button>
      </div>
    );
  }
  const done = votes.length === ROLE_ORDER.length;
  const yes = votes.filter(Boolean).length;
  const passed = yes * 2 > ROLE_ORDER.length;
  const role = ROLE_ORDER[votes.length];
  return (
    <div className="vote" aria-live="polite">
      <h3>Vote: {props.question}</h3>
      <p className="muted small">
        Each role votes in turn; votes stay hidden until everyone has voted. A majority is needed (
        {Math.floor(ROLE_ORDER.length / 2) + 1} of {ROLE_ORDER.length}).
      </p>
      <ol className="vote-list">
        {ROLE_ORDER.map((r, i) => (
          <li key={r}>
            {who(r)}: {i < votes.length ? (done ? (votes[i] ? "Yes" : "No") : "voted") : "waiting"}
          </li>
        ))}
      </ol>
      {!done && role && (
        <div className="actions">
          <span className="up-next">Up next: {who(role)}</span>
          <button className="ghost" onClick={() => setVotes([...votes, false])}>
            No
          </button>
          <button className="launch" onClick={() => setVotes([...votes, true])}>
            Yes
          </button>
        </div>
      )}
      {done && (
        <div className="actions">
          <span className={passed ? "ok" : "bad"}>
            {passed
              ? `Approved, ${yes} to ${ROLE_ORDER.length - yes}.`
              : `Rejected, ${yes} to ${ROLE_ORDER.length - yes}.`}
          </span>
          <button className="launch" onClick={() => props.onResult(passed)}>
            {passed ? props.yesLabel : props.noLabel}
          </button>
        </div>
      )}
    </div>
  );
}

// ---------- Requests and trades ----------

const amountText = (r: Pick<TeamRequest, "kind" | "amount">) =>
  r.kind === "budget" ? formatUsd(r.amount) : `${r.amount} ${UNIT[r.kind]}`;

function RequestItem({ r, design, mission }: { r: TeamRequest; design: Design; mission: Mission }) {
  const vote = useTeam((s) => s.vote);
  const who = useWho();
  const voters = votersOf(r);
  const next = voters.find((v) => r.votes[v] === undefined);
  const effect = r.status === "open" ? knockOn(r.kind, r.amount, r.from, r.to, design, mission) : [];
  const title =
    r.kind === "budget"
      ? `${who(r.from)} asks ${ROLE_LABEL[r.to]} for ${amountText(r)} of budget`
      : `${who(r.from)} asks ${ROLE_LABEL[r.to]} for +${amountText(r)}${r.offerUsd > 0 ? `, offering ${formatUsd(r.offerUsd)} in return` : ""}`;
  return (
    <li className={`req ${r.status === "accepted" ? "ok" : r.status === "rejected" ? "bad" : "warn"}`}>
      <div>
        <b>{title}</b> {r.byAdvisor && <span className="tag">advisor</span>}
        {r.note && <p className="muted small">“{r.note}”</p>}
        {effect.length > 0 && (
          <ul className="plain small">
            {effect.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
        {r.status === "open" && next && (
          <div className="actions">
            <span className="up-next">
              {voters.length > 1 ? "Vote" : "Answer"}: {who(next)}
              {voters.length > 1 &&
                ` (${voters.filter((v) => r.votes[v] !== undefined).length} of ${voters.length} voted)`}
            </span>
            <button className="ghost" onClick={() => vote(r.id, next, false)}>
              Reject
            </button>
            <button className="launch" onClick={() => vote(r.id, next, true)}>
              Accept
            </button>
          </div>
        )}
        {r.status !== "open" && (
          <p className="small">
            {r.status === "accepted" ? "Accepted" : "Rejected"}
            {voters.length > 1 ? ` (${voters.filter((v) => r.votes[v]).length} of ${voters.length} yes)` : ""}.
            {r.status === "accepted" &&
              r.kind !== "budget" &&
              ` ${ROLE_LABEL[r.to]} now needs to provide it in the design.`}
            {r.status === "rejected" && " Find another way, e.g. a lighter or less power-hungry part."}
          </p>
        )}
      </div>
    </li>
  );
}

export function RequestsPanel({
  role,
  design,
  mission,
  prefill,
}: {
  role: BudgetRole;
  design: Design;
  mission: Mission;
  prefill?: Prefill | undefined;
}) {
  const requests = useTeam((s) => s.requests);
  const openRequest = useTeam((s) => s.openRequest);
  const [kind, setKind] = useState<RequestKind>(prefill?.kind ?? "power");
  const [amount, setAmount] = useState(prefill?.amount ?? 10);
  const [giver, setGiver] = useState<BudgetRole>(ROLE_ORDER.find((r) => r !== role)!);
  const [offerM, setOfferM] = useState(0);
  const [note, setNote] = useState(prefill?.note ?? "");
  const [byAdvisor, setByAdvisor] = useState(prefill !== undefined);
  const [key, setKey] = useState(prefill?.key);
  if (prefill && prefill.key !== key) {
    // A new advisor suggestion fills the form.
    setKey(prefill.key);
    setKind(prefill.kind);
    setAmount(prefill.amount);
    setNote(prefill.note);
    setByAdvisor(true);
  }

  const to: BudgetRole =
    kind === "budget" ? (giver === role ? ROLE_ORDER.find((r) => r !== role)! : giver) : PROVIDER[kind];
  const selfProvider = kind !== "budget" && to === role;
  const usdAmount = kind === "budget" ? amount * 1e6 : amount;
  const preview = selfProvider ? [] : knockOn(kind, usdAmount, role, to, design, mission);

  return (
    <section className="picker" data-tour="requests">
      <h3>Requests and trades</h3>
      <form
        className="request-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (selfProvider || !(amount > 0)) return;
          openRequest({
            from: role,
            to,
            kind,
            amount: usdAmount,
            offerUsd: kind === "budget" ? 0 : offerM * 1e6,
            note,
            byAdvisor,
          });
          setNote("");
          setByAdvisor(false);
        }}
      >
        <span className="small">
          As <b>{ROLE_LABEL[role]}</b>, ask for
        </span>
        <label className="sr-only" htmlFor="req-amount">
          Amount
        </label>
        <input
          id="req-amount"
          type="number"
          min={0}
          step={kind === "budget" ? 0.1 : 1}
          value={amount}
          onChange={(e) => setAmount(Number(e.target.value))}
        />
        <select aria-label="What" value={kind} onChange={(e) => setKind(e.target.value as RequestKind)}>
          <option value="power">W of power (from Spacecraft)</option>
          <option value="mass">kg of mass capacity (from Launch)</option>
          <option value="budget">$M of budget</option>
        </select>
        {kind === "budget" ? (
          <select aria-label="From role" value={to} onChange={(e) => setGiver(e.target.value as BudgetRole)}>
            {ROLE_ORDER.filter((r) => r !== role).map((r) => (
              <option key={r} value={r}>
                from {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        ) : (
          <label className="small">
            offer $M in return{" "}
            <input
              type="number"
              min={0}
              step={0.1}
              value={offerM}
              onChange={(e) => setOfferM(Number(e.target.value))}
              aria-label="Budget offered in return, $M"
            />
          </label>
        )}
        <input
          className="note"
          placeholder="Why? (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          aria-label="Reason"
        />
        <button className="ghost" type="submit" disabled={selfProvider || !(amount > 0)}>
          {kind !== "budget" && offerM > 0 ? "Offer trade" : "Send request"}
        </button>
      </form>
      {selfProvider && (
        <p className="muted small">{ROLE_LABEL[role]} provides this itself: change your own parts instead.</p>
      )}
      {preview.length > 0 && (
        <div className="small preview">
          <b>Knock-on effect:</b>
          <ul className="plain">
            {preview.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      )}
      {requests.length > 0 && (
        <ul className="requests-list">
          {[...requests].reverse().map((r) => (
            <RequestItem key={r.id} r={r} design={design} mission={mission} />
          ))}
        </ul>
      )}
    </section>
  );
}

// ---------- Advisors (solo) ----------

export interface Prefill {
  key: string;
  kind: RequestKind;
  amount: number;
  note: string;
}

/** Which advisor triggers apply to the design right now. */
function activeTriggers(role: BudgetRole, b: Budget, design: Design, mission: Mission): Set<string> {
  const t = new Set<string>();
  const failed = (id: string) => b.checks.find((c) => c.id === id)?.ok === false;
  if (b.costByRole[role] === 0) t.add("intro");
  if ((b.maxMassKg !== null && failed("mass-structure")) || (b.launcherCapacityKg !== null && failed("mass-launcher")))
    t.add("mass-over");
  if (b.powerDrawnW > 0 && (failed("power") || failed("power-orbit"))) t.add("power-short");
  if (b.spendByRole[role] > b.allocationByRole[role]) t.add("budget-over");
  const rated = [...Object.values(design.parts), ...(design.instruments ?? [])];
  if (rated.some((p) => p && (trlPenaltyMonths(p.trl) ?? 0) > 0)) t.add("low-trl");
  if (design.launcher && design.launcher.successRate < 0.95) t.add("low-reliability");
  if (b.devMonths > 0 && mission.deadlineMonths - b.devMonths <= 4) t.add("deadline-risk");
  for (const id of ["R1", "R2", "R3", "R4"]) if (failed(id) && b.massKg > 0) t.add(`requirement-failed:${id}`);
  if (["R1", "R2", "R3", "R4"].every((id) => !failed(id))) t.add("all-requirements-met");
  t.add("request");
  return t;
}

/** Solo play: the role's advisor comments on the design and suggests requests (design.md section 3.4). */
export function AdvisorPanel(props: {
  role: BudgetRole;
  b: Budget;
  design: Design;
  mission: Mission;
  onSuggest: (p: Prefill) => void;
}) {
  const mode = useTeam((s) => s.mode);
  if (mode !== "solo") return null;
  const t = activeTriggers(props.role, props.b, props.design, props.mission);
  const lines = advisorLines.filter((l) => (l.role === props.role || l.role === "any") && t.has(l.when));
  if (lines.length === 0) return null;
  return (
    <section className="advisor" aria-label={`${ROLE_LABEL[props.role]} advisor`}>
      <h3>{ROLE_LABEL[props.role]} advisor</h3>
      <ul className="plain">
        {lines.map((l) => {
          const watts = /(\d+)\s*W\b/.exec(l.text);
          return (
            <li key={l.id}>
              “{l.text}”
              {l.when === "request" && (
                <button
                  className="ghost small-btn"
                  onClick={() =>
                    props.onSuggest({
                      key: `${l.id}-${Date.now()}`,
                      kind: "power",
                      amount: watts ? Number(watts[1]) : 10,
                      note: l.text,
                    })
                  }
                >
                  Raise this request
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

import type { Budget, Check } from "@space-mission/sim";

const status = (c: Check) => (c.ok ? "ok" : c.blocking ? "bad" : "warn");
const ICON = { ok: "✓", bad: "✗", warn: "!" } as const;
const WORD = { ok: "Met", bad: "Not met", warn: "Warning" } as const;

/** Every check of the design review, live: mission requirements (R1–R4 or L1–L5) first, then the engineering checks. */
export function RequirementsPanel({ b }: { b: Budget }) {
  const isReq = (c: Check) => /^[RL]\d+$/.test(c.id);
  const ordered = [...b.checks.filter(isReq), ...b.checks.filter((c) => !isReq(c))];
  const failing = b.checks.filter((c) => !c.ok && c.blocking).length;
  const warnings = b.checks.filter((c) => !c.ok && !c.blocking).length;

  return (
    <section className="requirements" aria-label="Requirements">
      <h3>
        Requirements{" "}
        <span className={`val ${failing ? "bad" : warnings ? "warn" : "ok"}`}>
          {failing ? `${failing} not met` : "all met"}
          {warnings ? ` · ${warnings} warning${warnings > 1 ? "s" : ""}` : ""}
        </span>
      </h3>
      <ul>
        {ordered.map((c) => {
          const s = status(c);
          return (
            <li key={c.id} className={`req ${s}`}>
              <span className="req-icon" aria-hidden="true">
                {ICON[s]}
              </span>
              <span>
                <span className="sr-only">{WORD[s]}: </span>
                {c.message}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

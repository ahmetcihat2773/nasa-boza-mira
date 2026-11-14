import { glossary } from "@space-mission/data";
import { useState, type ReactNode } from "react";

const byId = new Map(glossary.map((g) => [g.id, g]));

/** A technical word with its plain-English meaning on hover or keyboard focus. */
export function Term({ id, children, focusable = false }: { id: string; children: ReactNode; focusable?: boolean }) {
  const g = byId.get(id);
  if (!g) return <>{children}</>;
  return (
    <span
      className="term"
      tabIndex={focusable ? 0 : undefined}
      aria-label={`${typeof children === "string" ? children : g.term}: ${g.short}`}
    >
      {children}
      <span className="term-tip" role="tooltip">
        <b>{g.term}</b> {g.short}
      </span>
    </span>
  );
}

/** A button that opens the full glossary. */
export function GlossaryButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="ghost" onClick={() => setOpen(true)}>
        Glossary
      </button>
      {open && (
        <div className="glossary-backdrop" onClick={() => setOpen(false)}>
          <div
            className="glossary"
            role="dialog"
            aria-label="Glossary"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
          >
            <div className="glossary-head">
              <h2>Glossary</h2>
              <button className="ghost" autoFocus onClick={() => setOpen(false)}>
                Close
              </button>
            </div>
            <dl>
              {glossary.map((g) => (
                <div key={g.id}>
                  <dt>{g.term}</dt>
                  <dd>
                    {g.short}
                    {g.learnMore && (
                      <>
                        {" "}
                        <a href={g.learnMore.url} target="_blank" rel="noreferrer">
                          {g.learnMore.label}
                        </a>
                      </>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      )}
    </>
  );
}

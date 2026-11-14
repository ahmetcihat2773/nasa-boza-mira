import { tourSteps } from "@space-mission/data";
import { useEffect, useState } from "react";

const KEY = "space-mission.tour-done";

function tourDone(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}
function rememberDone() {
  try {
    localStorage.setItem(KEY, "1");
  } catch {
    // Storage blocked: the tour simply shows again next time.
  }
}

/** First-play tour: highlights the element marked data-tour="<target>" for each step. Skippable and remembered. */
export function Tour({ forceOpen = false, onClose }: { forceOpen?: boolean; onClose?: () => void }) {
  const [open, setOpen] = useState(() => forceOpen || !tourDone());
  const [i, setI] = useState(0);
  const step = tourSteps[i];

  useEffect(() => {
    if (!open || !step) return;
    const el = document.querySelector(`[data-tour="${step.target}"]`);
    el?.classList.add("tour-highlight");
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    return () => el?.classList.remove("tour-highlight");
  }, [open, step]);

  if (!open || !step) return null;
  const close = () => {
    rememberDone();
    setOpen(false);
    onClose?.();
  };
  const last = i === tourSteps.length - 1;

  return (
    <div className="tour" role="dialog" aria-label="Tour" onKeyDown={(e) => e.key === "Escape" && close()}>
      <div className="kicker">
        Tour · {i + 1} of {tourSteps.length}
      </div>
      <h3>{step.title}</h3>
      <p>{step.text}</p>
      <div className="actions">
        <button className="ghost" onClick={close}>
          Skip tour
        </button>
        {i > 0 && (
          <button className="ghost" onClick={() => setI(i - 1)}>
            Back
          </button>
        )}
        <button className="launch" autoFocus onClick={() => (last ? close() : setI(i + 1))}>
          {last ? "Done" : "Next"}
        </button>
      </div>
    </div>
  );
}

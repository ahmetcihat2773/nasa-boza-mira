import type { ReactNode } from "react";

export type Level = "ok" | "warn" | "bad";
/** Green below 85 % of the limit, amber up to 100 %, red above. */
export const level = (used: number, limit: number): Level =>
  used > limit ? "bad" : used > 0.85 * limit ? "warn" : "ok";

export function Meter(props: {
  label: ReactNode;
  value: string;
  used: number;
  limit: number;
  lvl?: Level | undefined;
}) {
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

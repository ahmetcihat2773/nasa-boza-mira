import {
  altitudeOptions,
  groundStations,
  instruments,
  launchersFor,
  maxGroundStations,
  orbitTypes,
  parts,
  type Subsystem,
} from "@space-mission/data";
import {
  formatUsd,
  stationContactMinutes,
  swathWidthKm,
  trlPenaltyMonths,
  type Budget,
  type Mission,
} from "@space-mission/sim";
import { instrumentLockReason, launcherLockReason, missionPartLockReason, partFits, partLockReason } from "../lock.ts";
import { destinationOf } from "../missions.ts";
import { useGame } from "../store.ts";
import { Term } from "./Glossary.tsx";

export const LABELS: Record<Subsystem, string> = {
  structure: "Structure",
  solar: "Solar panels",
  battery: "Battery",
  obc: "On-board computer",
  adcs: "Attitude control",
  propulsion: "Propulsion",
  comms: "Communications",
};
const TERM: Partial<Record<Subsystem, string>> = {
  solar: "solar-panel",
  battery: "battery",
  obc: "obc",
  adcs: "adcs",
  propulsion: "propulsion",
  comms: "downlink",
};

function TrlText({ trl }: { trl: number }) {
  const penalty = trlPenaltyMonths(trl);
  return (
    <>
      <Term id="trl">TRL</Term> {trl}
      {penalty ? ` (+${penalty} months)` : ""}
    </>
  );
}

export function PartPicker({ subsystem, mission }: { subsystem: Subsystem; mission: Mission }) {
  const design = useGame((s) => s.design);
  const pickPart = useGame((s) => s.pickPart);
  const size = design.parts.structure?.fits[0];
  const chosen = design.parts[subsystem];
  const isStructure = subsystem === "structure";
  const options = parts.filter((p) => p.subsystem === subsystem && (isStructure || partFits(p, size)));
  const term = TERM[subsystem];

  return (
    <section className="picker">
      <h3>
        {term ? (
          <Term id={term} focusable>
            {LABELS[subsystem]}
          </Term>
        ) : (
          LABELS[subsystem]
        )}
        {isStructure && size && <span className="tag">{size}</span>}
      </h3>
      {!isStructure && !size ? (
        <p className="muted">Choose a structure first (Spacecraft tab): it sets the spacecraft size.</p>
      ) : (
        <ul>
          {options.map((p) => {
            const lock = partLockReason(p) ?? missionPartLockReason(p, mission);
            const active = chosen?.id === p.id;
            const power = p.powerProducedW ? `+${p.powerProducedW} W produced` : `${p.powerW} W drawn`;
            return (
              <li key={p.id}>
                <button
                  className={`option ${active ? "active" : ""}`}
                  disabled={lock !== null}
                  aria-pressed={active}
                  onClick={() => pickPart(subsystem, active ? undefined : p)}
                >
                  <span className="name">{p.name}</span>
                  <span className="perf">
                    {p.performance.label}: {p.performance.value} {p.performance.unit}
                  </span>
                  <span className="delta">
                    +{p.massKg} kg · {power} · +{formatUsd(p.costUsd)} · <TrlText trl={p.trl} />
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

const DETECTS: Record<string, string> = {
  daylightFire: "fires by day",
  nightFire: "fires at night",
  smoke: "smoke",
  waterIce: "water ice",
};

export function InstrumentPicker({ b }: { b: Budget }) {
  const design = useGame((s) => s.design);
  const toggle = useGame((s) => s.toggleInstrument);
  const size = design.parts.structure?.fits[0];
  const chosen = design.instruments ?? [];
  const options = instruments.filter((i) => partFits(i, size));
  const alt = b.orbit.altitudeKm;

  return (
    <section className="picker">
      <h3>
        <Term id="payload" focusable>
          Instruments
        </Term>
        <span className="tag">pick one or more</span>
      </h3>
      {!size ? (
        <p className="muted">Choose a structure first (Spacecraft tab): it sets which instruments fit.</p>
      ) : (
        <ul>
          {options.map((i) => {
            const lock = instrumentLockReason(i);
            const active = chosen.some((c) => c.id === i.id);
            return (
              <li key={i.id}>
                <button
                  className={`option ${active ? "active" : ""}`}
                  disabled={lock !== null}
                  aria-pressed={active}
                  onClick={() => toggle(i)}
                >
                  <span className="name">{i.name}</span>
                  <span className="perf">
                    Sees {i.detects.map((d) => DETECTS[d] ?? d).join(", ")} · <Term id="fov">field of view</Term>{" "}
                    {i.fieldOfViewDeg}° gives a <Term id="swath">swath</Term> of{" "}
                    {swathWidthKm(i.fieldOfViewDeg, alt).toFixed(0)} km at {alt} km
                  </span>
                  <span className="delta">
                    +{i.massKg} kg · {i.powerW} W while imaging · <Term id="data-rate">{i.dataRateMbps} Mbps</Term> · +
                    {formatUsd(i.costUsd)} · <TrlText trl={i.trl} />
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

export function LauncherPicker({ b, mission }: { b: Budget; mission: Mission }) {
  const chosen = useGame((s) => s.design.launcher);
  const pickLauncher = useGame((s) => s.pickLauncher);
  const destination = destinationOf(mission.card);
  const lunar = destination === "lunar-orbit";
  const launchers = launchersFor(destination);
  return (
    <section className="picker">
      <h3>
        <Term id="launch-vehicle" focusable>
          Launcher
        </Term>
      </h3>
      <ul>
        {launchers.map((l) => {
          const lock = launcherLockReason(l, b.massKg, mission);
          const active = chosen?.id === l.id;
          const perKg =
            l.costPerKgUsd && l.includedKg ? ` up to ${l.includedKg} kg, then $${l.costPerKgUsd / 1000}k/kg` : "";
          return (
            <li key={String(l.id)}>
              <button
                className={`option ${active ? "active" : ""}`}
                disabled={lock !== null}
                aria-pressed={active}
                onClick={() => pickLauncher(active ? undefined : l)}
              >
                <span className="name">{l.name}</span>
                <span className="delta">
                  {formatUsd(l.launchCostUsd)}
                  {perKg} · <Term id="sso">SSO</Term> capacity {l.ssoCapacityKg} kg
                  {lunar &&
                    active &&
                    b.launcherCapacityKg !== null &&
                    ` · to the Moon about ${b.launcherCapacityKg} kg`}
                  {l.fixedOrbit && ` · fixed orbit: ${l.fixedOrbit.altitudeKm} km ${l.fixedOrbit.type}`}
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

const ORBIT_TERM: Record<string, string> = { "sun-synchronous": "sso", polar: "polar-orbit" };

export function OrbitPicker({ b, mission }: { b: Budget; mission: Mission }) {
  const launcher = useGame((s) => s.design.launcher);
  const setOrbit = useGame((s) => s.setOrbit);
  const fixed = b.orbit.fixedByLauncher;
  const lunar = destinationOf(mission.card) === "lunar-orbit";
  const moonAlts = mission.card.transfer?.altitudesKm;

  if (lunar) {
    return (
      <section className="picker">
        <h3>
          Lunar orbit
          <span className="tag">
            <Term id="polar-orbit" focusable>
              polar
            </Term>
            , <Term id="inclination">inclination</Term> {b.orbit.inclinationDeg.toFixed(1)}°
          </span>
        </h3>
        <p className="muted small">
          The mission needs a polar orbit around the Moon, so only the altitude is yours to choose: lower means sharper
          maps, more time in shadow and more fuel to hold the orbit.
        </p>
        {fixed && (
          <p className="muted">
            The{" "}
            <Term id="rideshare" focusable>
              {launcher?.name ?? "rideshare"}
            </Term>{" "}
            decides the orbit. Choose a dedicated launcher to pick your own.
          </p>
        )}
        <fieldset disabled={fixed} className="orbit-choice">
          <legend>
            <Term id="altitude" focusable>
              Altitude above the Moon
            </Term>
          </legend>
          <select
            aria-label="Altitude"
            value={b.orbit.altitudeKm}
            onChange={(e) => setOrbit({ type: b.orbit.type, altitudeKm: Number(e.target.value) })}
          >
            {(moonAlts ?? altitudeOptions.map((a) => a.altitudeKm)).map((alt) => (
              <option key={alt} value={alt}>
                {alt} km
              </option>
            ))}
          </select>
        </fieldset>
      </section>
    );
  }

  return (
    <section className="picker">
      <h3>
        Orbit
        <span className="tag">
          <Term id="inclination" focusable>
            inclination
          </Term>{" "}
          {b.orbit.inclinationDeg.toFixed(1)}°
        </span>
      </h3>
      {fixed && (
        <p className="muted">
          The{" "}
          <Term id="rideshare" focusable>
            {launcher?.name ?? "rideshare"}
          </Term>{" "}
          decides the orbit. Choose a dedicated launcher to pick your own.
        </p>
      )}
      <fieldset disabled={fixed} className="orbit-choice">
        <legend>Orbit type</legend>
        {orbitTypes.map((o) => {
          const term = ORBIT_TERM[o.id];
          return (
            <label key={o.id} className="radio">
              <input
                type="radio"
                name="orbit-type"
                checked={b.orbit.type === o.id}
                onChange={() => setOrbit({ type: o.id, altitudeKm: b.orbit.altitudeKm })}
              />
              <span>
                <b>{term ? <Term id={term}>{o.name}</Term> : o.name}</b>
                <span className="muted small"> {o.text}</span>
              </span>
            </label>
          );
        })}
      </fieldset>
      <fieldset disabled={fixed} className="orbit-choice">
        <legend>
          <Term id="altitude" focusable>
            Altitude
          </Term>
        </legend>
        <select
          aria-label="Altitude"
          value={b.orbit.altitudeKm}
          onChange={(e) => setOrbit({ type: b.orbit.type, altitudeKm: Number(e.target.value) })}
        >
          {altitudeOptions.map((a) => (
            <option key={a.altitudeKm} value={a.altitudeKm}>
              {a.altitudeKm} km · stays up about {a.lifetimeYearsNoPropulsion} years without propulsion
            </option>
          ))}
        </select>
      </fieldset>
    </section>
  );
}

export function GroundPicker({ b, mission }: { b: Budget; mission: Mission }) {
  const setStations = useGame((s) => s.setGroundStations);
  const chosen = b.groundStations;
  const full = chosen.length >= maxGroundStations;
  const lunar = destinationOf(mission.card) === "lunar-orbit";
  // Only deep-space dishes reach the Moon; near-Earth stations see nothing that far out.
  const offered = lunar ? groundStations.filter((g) => g.kind === "deep-space") : groundStations;

  return (
    <section className="picker">
      <h3>
        <Term id="ground-station" focusable>
          Ground stations
        </Term>
        <span className="tag">
          {chosen.length} of up to {maxGroundStations}
        </span>
      </h3>
      {lunar && (
        <p className="muted small">
          At lunar distance only the deep-space dishes can talk to the spacecraft; near-Earth stations are out of range.
        </p>
      )}
      <ul>
        {offered.map((g) => {
          const active = chosen.some((c) => c.id === g.id);
          const minutes = Math.round(stationContactMinutes(g, b.orbit, mission));
          const lock = !active && full ? `At most ${maxGroundStations} ground stations.` : null;
          return (
            <li key={g.id}>
              <button
                className={`option ${active ? "active" : ""}`}
                disabled={lock !== null}
                aria-pressed={active}
                onClick={() => setStations(active ? chosen.filter((c) => c.id !== g.id) : [...chosen, g])}
              >
                <span className="name">
                  {g.name}
                  {g.kind === "deep-space" && <span className="tag">deep space</span>}
                </span>
                <span className="perf">{g.text}</span>
                <span className="delta">
                  +{minutes} min/day of <Term id="contact-time">contact</Term> in this orbit · +{formatUsd(g.costUsd)}
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

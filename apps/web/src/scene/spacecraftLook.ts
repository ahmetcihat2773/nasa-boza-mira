import type { InstrumentKind, SpacecraftSize } from "@space-mission/data";
import type { Design } from "@space-mission/sim";

export type SolarLook = "none" | "body" | "wings" | "rollout";
export type AntennaLook = "none" | "whip" | "patch" | "dish" | "laser";

export interface ApertureLook {
  kind: InstrumentKind;
  /** Lens radius, dm. */
  radius: number;
  /** Barrel length, dm. */
  length: number;
}

/** What the 3D spacecraft shows, derived from the chosen parts. Dimensions in decimetres. */
export interface SpacecraftLook {
  size: SpacecraftSize;
  /** Body: x (cross-track), y (zenith, nadir is -y), z (along-track). */
  body: [number, number, number];
  solar: SolarLook;
  antenna: AntennaLook;
  apertures: ApertureLook[];
  thruster: boolean;
}

const BODY: Record<SpacecraftSize, [number, number, number]> = {
  "6U": [2.26, 1.0, 3.4],
  "12U": [2.26, 2.26, 3.4],
  smallsat: [6, 6, 8],
};

/** Map the design's parts and instruments to model features. An empty design shows a typical 6U. */
export function spacecraftLook(design: Design | undefined): SpacecraftLook {
  const p = design?.parts ?? {};
  const size = p.structure?.fits[0] ?? "6U";
  const solarId = p.solar?.id ?? (design ? "" : "deployable");
  const commsId = p.comms?.id ?? (design ? "" : "sband");
  const big = size === "smallsat";
  const instruments = design ? (design.instruments ?? []) : [];
  const apertures: ApertureLook[] = instruments.slice(0, 3).map((i) => ({
    kind: i.kind,
    radius: (big ? 1.1 : 0.38) * (i.fieldOfViewDeg < 10 ? 1.2 : i.fieldOfViewDeg > 60 ? 0.8 : 1),
    length: (big ? 1.6 : 0.5) * (i.fieldOfViewDeg < 10 ? 1.8 : 1),
  }));
  if (!design) apertures.push({ kind: "swir-mwir", radius: 0.38, length: 0.5 });
  return {
    size,
    body: BODY[size],
    solar: solarId.includes("rollout")
      ? "rollout"
      : solarId.includes("deployable")
        ? "wings"
        : solarId.includes("body")
          ? "body"
          : "none",
    antenna: commsId.includes("uhf")
      ? "whip"
      : commsId.includes("ka")
        ? "dish"
        : commsId.includes("laser")
          ? "laser"
          : commsId
            ? "patch"
            : "none",
    apertures,
    thruster: !!p.propulsion && p.propulsion.id !== "propulsion-none",
  };
}

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef, type ReactNode } from "react";
import * as THREE from "three";
import { spacecraftLook, type SpacecraftLook } from "./spacecraftLook.ts";

let cellTexture: THREE.CanvasTexture | null = null;

/** Procedural solar-cell texture: dark blue cells with silver gaps and bus bars. */
function solarCells(): THREE.CanvasTexture {
  if (cellTexture) return cellTexture;
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  const g = c.getContext("2d")!;
  g.fillStyle = "#aab4c4";
  g.fillRect(0, 0, 256, 256);
  const cols = 4;
  const rows = 6;
  const cw = 256 / cols;
  const ch = 256 / rows;
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const grad = g.createLinearGradient(i * cw, j * ch, (i + 1) * cw, (j + 1) * ch);
      grad.addColorStop(0, "#1a2a6b");
      grad.addColorStop(1, "#0c1640");
      g.fillStyle = grad;
      g.fillRect(i * cw + 3, j * ch + 3, cw - 6, ch - 6);
      g.fillStyle = "rgba(170,190,230,0.35)";
      for (let k = 1; k < 4; k++) g.fillRect(i * cw + 3, j * ch + (k * ch) / 4, cw - 6, 1);
    }
  }
  cellTexture = new THREE.CanvasTexture(c);
  cellTexture.colorSpace = THREE.SRGBColorSpace;
  cellTexture.anisotropy = 4;
  return cellTexture;
}

export interface SatelliteProps {
  /** What to build (from spacecraftLook(design)); a typical 6U when omitted. */
  look?: SpacecraftLook;
  /** 0 = solar wings folded against the body, 1 = fully deployed. */
  deploy?: number | { current: number };
  scale?: number;
}

const DEFAULT_LOOK = spacecraftLook(undefined);

/** Display scale so a small satellite does not dwarf the CubeSats in the orbit view. */
export const lookScale = (look: SpacecraftLook) => (look.size === "smallsat" ? 0.5 : 1);

/**
 * The spacecraft in decimetres: +z along the velocity, -y toward Earth (nadir).
 * Body size, solar panels, antenna, instrument apertures and thruster follow the chosen parts.
 */
export function Satellite({ look = DEFAULT_LOOK, deploy = 1, scale = 1 }: SatelliteProps) {
  const cells = useMemo(() => solarCells(), []);
  const mats = useMemo(
    () => ({
      foil: new THREE.MeshStandardMaterial({ color: "#d9a640", metalness: 0.95, roughness: 0.32 }),
      frame: new THREE.MeshStandardMaterial({ color: "#b9c0cb", metalness: 0.8, roughness: 0.35 }),
      cells: new THREE.MeshStandardMaterial({ map: cells, metalness: 0.55, roughness: 0.22 }),
      flex: new THREE.MeshStandardMaterial({ map: cells, color: "#8a98c0", metalness: 0.4, roughness: 0.3 }),
      back: new THREE.MeshStandardMaterial({ color: "#d8dce2", metalness: 0.2, roughness: 0.6 }),
      lens: new THREE.MeshStandardMaterial({ color: "#05070c", metalness: 0.9, roughness: 0.06 }),
      black: new THREE.MeshStandardMaterial({ color: "#16181d", metalness: 0.3, roughness: 0.6 }),
      white: new THREE.MeshStandardMaterial({ color: "#eceef2", metalness: 0.1, roughness: 0.5 }),
      gold: new THREE.MeshStandardMaterial({ color: "#e0b050", metalness: 1, roughness: 0.2 }),
    }),
    [cells],
  );

  const [bx, by, bz] = look.body;
  const big = look.size === "smallsat";
  const u = big ? 2.4 : 1; // size of small fittings
  // Box face order: +x, -x, +y, -y, +z, -z. Body-mounted cells cover the sides and the zenith face.
  const bodyMats = useMemo(() => {
    const solarFace = look.solar === "body" ? mats.cells : mats.foil;
    return [solarFace, solarFace, solarFace, mats.foil, mats.foil, mats.foil];
  }, [look.solar, mats]);

  // Solar wings: hinged segments on each side.
  const segments = look.solar === "rollout" ? 3 : look.solar === "wings" ? 2 : 0;
  const segW = Math.max(by, bx * 0.9);
  const segL = bz * 0.92;
  const wings = useRef<(THREE.Group | null)[]>([]);
  useFrame(() => {
    const d = typeof deploy === "number" ? deploy : deploy.current;
    const e = 1 - Math.pow(1 - THREE.MathUtils.clamp(d, 0, 1), 3);
    wings.current.forEach((g, i) => {
      if (!g || segments === 0) return;
      const side = i < segments ? 1 : -1;
      const k = i % segments;
      // Folded: the first segment hangs down the body side, the others fold back and forth over it.
      const folded = k === 0 ? -Math.PI / 2 : k % 2 === 1 ? Math.PI : -Math.PI;
      g.rotation.z = side * folded * (1 - e);
    });
  });
  const wing = (side: 1 | -1) => {
    let node: ReactNode = null;
    for (let k = segments - 1; k >= 0; k--) {
      const idx = (side > 0 ? 0 : segments) + k;
      node = (
        <group position={k === 0 ? [0, 0, 0] : [side * (segW + 0.08), 0, 0]}>
          <group ref={(g) => void (wings.current[idx] = g)}>
            <mesh
              position={[side * (segW / 2 + 0.04), 0, 0]}
              material={look.solar === "rollout" ? mats.flex : mats.cells}
            >
              <boxGeometry args={[segW, 0.04, segL]} />
            </mesh>
            <mesh position={[side * (segW / 2 + 0.04), -0.03, 0]} material={mats.back}>
              <boxGeometry args={[segW, 0.02, segL]} />
            </mesh>
            {node}
          </group>
        </group>
      );
    }
    return node;
  };

  // Instrument apertures along the nadir face, from the front.
  const n = look.apertures.length;
  const apertures = look.apertures.map((a, i) => {
    const z = bz / 2 - (i + 0.8) * (bz / (n + 1.2));
    const x = n > 1 ? (i % 2 === 0 ? -0.15 : 0.15) * bx : 0;
    const rim = a.kind === "thermal-ir" ? mats.gold : mats.black;
    return (
      <group key={i} position={[x, -by / 2, z]}>
        <mesh position={[0, -a.length / 2, 0]} material={rim}>
          {a.kind === "multiband" ? (
            <boxGeometry args={[a.radius * 2.2, a.length, a.radius * 1.4]} />
          ) : (
            <cylinderGeometry args={[a.radius * 1.15, a.radius * 1.3, a.length, 32]} />
          )}
        </mesh>
        <mesh position={[0, -a.length - 0.01, 0]} material={mats.lens}>
          <cylinderGeometry args={[a.radius * 0.85, a.radius * 0.85, 0.02, 32]} />
        </mesh>
      </group>
    );
  });

  let antenna: ReactNode = null;
  if (look.antenna === "whip") {
    antenna = [0, 1, 2, 3].map((i) => {
      const sx = i < 2 ? 1 : -1;
      const sy = i % 2 === 0 ? 1 : -1;
      return (
        <mesh
          key={i}
          position={[sx * (bx / 2 + 1.1 * u), sy * by * 0.3, -bz / 2]}
          rotation={[0, 0, Math.PI / 2 + sx * sy * 0.5]}
          material={mats.frame}
        >
          <cylinderGeometry args={[0.025, 0.025, 2.4 * u, 6]} />
        </mesh>
      );
    });
  } else if (look.antenna === "patch") {
    antenna = (
      <mesh position={[0, -by / 2 - 0.03, -bz / 2 + 0.6 * u]} material={mats.white}>
        <boxGeometry args={[0.8 * u, 0.06, 0.8 * u]} />
      </mesh>
    );
  } else if (look.antenna === "dish") {
    antenna = (
      <group position={[0, -by / 2, -bz / 2 + 0.9 * u]}>
        <mesh position={[0, -0.25 * u, 0]} material={mats.frame}>
          <cylinderGeometry args={[0.05, 0.05, 0.5 * u, 8]} />
        </mesh>
        <mesh position={[0, -0.5 * u, 0]} rotation={[Math.PI, 0, 0]} material={mats.white}>
          <sphereGeometry args={[0.8 * u, 32, 8, 0, Math.PI * 2, 0, 0.75]} />
        </mesh>
      </group>
    );
  } else if (look.antenna === "laser") {
    antenna = (
      <group position={[bx * 0.25, -by / 2, -bz / 2 + 0.6 * u]}>
        <mesh position={[0, -0.3 * u, 0]} material={mats.frame}>
          <cylinderGeometry args={[0.28 * u, 0.28 * u, 0.6 * u, 24]} />
        </mesh>
        <mesh position={[0, -0.61 * u, 0]}>
          <cylinderGeometry args={[0.2 * u, 0.2 * u, 0.02, 24]} />
          <meshBasicMaterial color={[0.4, 2.2, 1.2]} toneMapped={false} />
        </mesh>
      </group>
    );
  }

  return (
    <group scale={scale}>
      <mesh material={bodyMats}>
        <boxGeometry args={[bx, by, bz]} />
      </mesh>
      {big ? (
        <mesh position={[0, by / 2 + 0.05, 0]} material={mats.frame}>
          <boxGeometry args={[bx * 1.02, 0.1, bz * 1.02]} />
        </mesh>
      ) : (
        [-1, 1].map((sx) =>
          [-1, 1].map((sy) => (
            <mesh key={`${sx}${sy}`} position={[(sx * bx) / 2, (sy * by) / 2, 0]} material={mats.frame}>
              <boxGeometry args={[0.12, 0.12, bz + 0.1]} />
            </mesh>
          )),
        )
      )}
      {/* Star tracker on the zenith face */}
      <mesh position={[-bx * 0.25, by / 2 + 0.2 * u, -bz * 0.3]} rotation={[0.4, 0, 0]} material={mats.black}>
        <cylinderGeometry args={[0.18 * u, 0.12 * u, 0.4 * u, 16]} />
      </mesh>
      {apertures}
      {antenna}
      {look.thruster && (
        <mesh position={[0, 0, -bz / 2 - 0.2 * u]} rotation={[-Math.PI / 2, 0, 0]} material={mats.frame}>
          <cylinderGeometry args={[0.08 * u, 0.22 * u, 0.4 * u, 16, 1, true]} />
        </mesh>
      )}
      {segments > 0 &&
        ([1, -1] as const).map((side) => (
          <group key={side} position={[(side * bx) / 2, by / 2, 0]}>
            {wing(side)}
          </group>
        ))}
    </group>
  );
}

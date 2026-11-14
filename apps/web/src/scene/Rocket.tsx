import { useMemo } from "react";
import * as THREE from "three";

/** Rocket dimensions (scene units ≈ metres). Base of the first stage at y = 0. */
export const ROCKET = {
  radius: 0.9,
  stage1: 15,
  interstage: 1.3,
  stage2: 4.2,
  fairingRadius: 1.12,
  fairingHeight: 6.2,
};
export const ROCKET_HEIGHT = ROCKET.stage1 + ROCKET.interstage + ROCKET.stage2 + ROCKET.fairingHeight;
const STAGE2_BASE = ROCKET.stage1 + ROCKET.interstage;
export const FAIRING_BASE = STAGE2_BASE + ROCKET.stage2;

let paintTexture: THREE.CanvasTexture | null = null;
/** Subtle panel lines and a dark roll pattern band, drawn once. */
function paint(): THREE.CanvasTexture {
  if (paintTexture) return paintTexture;
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 1024;
  const g = c.getContext("2d")!;
  g.fillStyle = "#eef0f2";
  g.fillRect(0, 0, 512, 1024);
  g.fillStyle = "rgba(0,0,0,0.07)";
  for (let y = 0; y < 1024; y += 128) g.fillRect(0, y, 512, 2);
  for (let x = 0; x < 512; x += 128) g.fillRect(x, 0, 2, 1024);
  // Roll-pattern checks near the top of the stage (camera reference marks on real rockets).
  g.fillStyle = "#15171b";
  for (let i = 0; i < 4; i++) g.fillRect(i * 128, 60, 64, 70);
  // A thin raceway stripe.
  g.fillStyle = "rgba(0,0,0,0.18)";
  g.fillRect(300, 0, 8, 1024);
  paintTexture = new THREE.CanvasTexture(c);
  paintTexture.colorSpace = THREE.SRGBColorSpace;
  paintTexture.anisotropy = 8;
  return paintTexture;
}

function useMaterials() {
  return useMemo(() => {
    const body = new THREE.MeshPhysicalMaterial({
      map: paint(),
      roughness: 0.38,
      metalness: 0.05,
      clearcoat: 0.6,
      clearcoatRoughness: 0.25,
    });
    return {
      body,
      white: new THREE.MeshPhysicalMaterial({
        color: "#f1f2f4",
        roughness: 0.32,
        clearcoat: 0.7,
        clearcoatRoughness: 0.2,
      }),
      carbon: new THREE.MeshStandardMaterial({ color: "#1b1d22", roughness: 0.55, metalness: 0.3 }),
      metal: new THREE.MeshStandardMaterial({ color: "#3a3d44", roughness: 0.3, metalness: 0.95 }),
      bell: new THREE.MeshStandardMaterial({
        color: "#6b4b35",
        roughness: 0.35,
        metalness: 0.9,
        side: THREE.DoubleSide,
      }),
      niobium: new THREE.MeshStandardMaterial({
        color: "#8d8f95",
        roughness: 0.25,
        metalness: 1,
        side: THREE.DoubleSide,
      }),
    };
  }, []);
}

function bellGeometry(r0: number, r1: number, h: number) {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    pts.push(new THREE.Vector2(r0 + (r1 - r0) * Math.pow(t, 0.65), -t * h));
  }
  return new THREE.LatheGeometry(pts, 40);
}

/** Ogive fairing half (or whole). phiStart/phiLength in radians. */
export function fairingGeometry(phiStart = 0, phiLength = Math.PI * 2) {
  const { fairingRadius: R, fairingHeight: H } = ROCKET;
  const pts: THREE.Vector2[] = [new THREE.Vector2(ROCKET.radius, 0), new THREE.Vector2(R, 0.5)];
  const cyl = H * 0.42;
  pts.push(new THREE.Vector2(R, cyl));
  for (let i = 1; i <= 20; i++) {
    const t = i / 20;
    const y = cyl + t * (H - cyl);
    const r = R * Math.sqrt(Math.max(0, 1 - t * t)) * (1 - 0.05 * t);
    pts.push(new THREE.Vector2(Math.max(r, 0.001), y));
  }
  return new THREE.LatheGeometry(pts, 48, phiStart, phiLength);
}

/** First stage: body, interstage, four engines and fins. Origin at the base. */
export function FirstStage() {
  const m = useMaterials();
  const bell = useMemo(() => bellGeometry(0.16, 0.32, 0.75), []);
  const engines: [number, number][] = [
    [0.42, 0.42],
    [-0.42, 0.42],
    [0.42, -0.42],
    [-0.42, -0.42],
  ];
  return (
    <group>
      <mesh position={[0, ROCKET.stage1 / 2, 0]} material={m.body} castShadow receiveShadow>
        <cylinderGeometry args={[ROCKET.radius, ROCKET.radius, ROCKET.stage1, 48]} />
      </mesh>
      <mesh position={[0, ROCKET.stage1 + ROCKET.interstage / 2, 0]} material={m.carbon} castShadow>
        <cylinderGeometry args={[ROCKET.radius, ROCKET.radius, ROCKET.interstage, 48]} />
      </mesh>
      {/* Thrust section */}
      <mesh position={[0, 0.35, 0]} material={m.carbon} castShadow>
        <cylinderGeometry args={[ROCKET.radius * 1.01, ROCKET.radius * 1.04, 0.7, 48]} />
      </mesh>
      <mesh position={[0, 0.02, 0]} material={m.metal}>
        <cylinderGeometry args={[ROCKET.radius * 0.95, ROCKET.radius * 0.95, 0.06, 32]} />
      </mesh>
      {engines.map(([x, z]) => (
        <mesh key={`${x}${z}`} geometry={bell} material={m.bell} position={[x, 0, z]} castShadow />
      ))}
      {[0, 1, 2, 3].map((i) => (
        <mesh
          key={i}
          position={[
            Math.cos((i * Math.PI) / 2 + Math.PI / 4) * 1.05,
            1.0,
            Math.sin((i * Math.PI) / 2 + Math.PI / 4) * 1.05,
          ]}
          rotation={[0, -(i * Math.PI) / 2 - Math.PI / 4, 0]}
          material={m.carbon}
          castShadow
        >
          <boxGeometry args={[0.5, 1.6, 0.06]} />
        </mesh>
      ))}
    </group>
  );
}

/** Second stage with its vacuum engine. Origin at the stage base (separation plane). */
export function SecondStage() {
  const m = useMaterials();
  const bell = useMemo(() => bellGeometry(0.18, 0.62, 1.25), []);
  return (
    <group>
      <mesh position={[0, ROCKET.stage2 / 2, 0]} material={m.white} castShadow receiveShadow>
        <cylinderGeometry args={[ROCKET.radius, ROCKET.radius, ROCKET.stage2, 48]} />
      </mesh>
      <mesh position={[0, ROCKET.stage2 - 0.08, 0]} material={m.carbon}>
        <cylinderGeometry args={[ROCKET.radius * 1.005, ROCKET.radius * 1.005, 0.16, 48]} />
      </mesh>
      <mesh position={[0, 0.25, 0]} material={m.carbon}>
        <cylinderGeometry args={[ROCKET.radius * 1.005, ROCKET.radius * 1.005, 0.5, 48]} />
      </mesh>
      <mesh geometry={bell} material={m.niobium} position={[0, 0, 0]} />
      {/* Payload adapter and separation ring */}
      <mesh position={[0, ROCKET.stage2 + 0.25, 0]} material={m.carbon}>
        <cylinderGeometry args={[0.38, ROCKET.radius * 0.98, 0.5, 40]} />
      </mesh>
      <mesh position={[0, ROCKET.stage2 + 0.53, 0]} material={m.metal}>
        <cylinderGeometry args={[0.4, 0.4, 0.06, 32]} />
      </mesh>
    </group>
  );
}

/** One fairing half (side = 1 or -1). Origin at the fairing base on the rocket axis. */
export function FairingHalf({ side }: { side: 1 | -1 }) {
  const m = useMaterials();
  const geo = useMemo(() => fairingGeometry(side > 0 ? 0 : Math.PI, Math.PI), [side]);
  return <mesh geometry={geo} material={m.white} castShadow receiveShadow />;
}

/** The full stack standing on the pad. */
export function Rocket() {
  return (
    <group>
      <FirstStage />
      <group position={[0, STAGE2_BASE, 0]}>
        <SecondStage />
      </group>
      <group position={[0, FAIRING_BASE, 0]}>
        <FairingHalf side={1} />
        <FairingHalf side={-1} />
      </group>
    </group>
  );
}

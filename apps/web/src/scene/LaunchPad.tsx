import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { ROCKET_HEIGHT } from "./Rocket.tsx";

const TOWER_X = -3.6;
const TOWER_W = 2.6;
const TOWER_H = ROCKET_HEIGHT + 5;

type Beam = [THREE.Vector3, THREE.Vector3, number];

function towerBeams(): Beam[] {
  const beams: Beam[] = [];
  const h = TOWER_W / 2;
  const corners = [
    [-h, -h],
    [h, -h],
    [h, h],
    [-h, h],
  ] as const;
  const v = (x: number, y: number, z: number) => new THREE.Vector3(TOWER_X + x, y, z);
  for (const [x, z] of corners) beams.push([v(x, 0, z), v(x, TOWER_H, z), 0.22]);
  const step = 2.6;
  for (let y = 0; y <= TOWER_H + 0.01; y += step) {
    for (let i = 0; i < 4; i++) {
      const a = corners[i]!;
      const b = corners[(i + 1) % 4]!;
      beams.push([v(a[0], y, a[1]), v(b[0], y, b[1]), 0.14]);
      if (y + step <= TOWER_H + 0.01) {
        const flip = (Math.round(y / step) + i) % 2 === 0;
        beams.push([v(a[0], flip ? y : y + step, a[1]), v(b[0], flip ? y + step : y, b[1]), 0.08]);
      }
    }
  }
  // Lightning mast on top.
  beams.push([v(0, TOWER_H, 0), v(0, TOWER_H + 7, 0), 0.12]);
  return beams;
}

/** Lattice tower drawn as one instanced mesh of beams. */
function Tower() {
  const beams = useMemo(towerBeams, []);
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    beams.forEach(([a, b, t], i) => {
      const d = b.clone().sub(a);
      q.setFromUnitVectors(up, d.clone().normalize());
      m.compose(a.clone().add(b).multiplyScalar(0.5), q, new THREE.Vector3(t, d.length(), t));
      ref.current?.setMatrixAt(i, m);
    });
    if (ref.current) ref.current.instanceMatrix.needsUpdate = true;
  }, [beams]);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, beams.length]} castShadow receiveShadow>
      <boxGeometry />
      <meshStandardMaterial color="#5d636c" roughness={0.6} metalness={0.6} />
    </instancedMesh>
  );
}

const beamVertex = /* glsl */ `
  varying float vY;
  varying vec3 vN; varying vec3 vV;
  void main() {
    vY = uv.y;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vN = normalize(mat3(modelMatrix) * normal);
    vV = normalize(cameraPosition - wp.xyz);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;
const beamFragment = /* glsl */ `
  uniform vec3 uColor; uniform float uStrength;
  varying float vY; varying vec3 vN; varying vec3 vV;
  void main() {
    float edge = pow(abs(dot(normalize(vN), normalize(vV))), 2.0);
    float a = pow(vY, 2.2) * edge * uStrength;
    gl_FragColor = vec4(uColor * a, 1.0);
  }
`;

/** A floodlight pole with a volumetric-looking beam aimed at the rocket. */
function Floodlight({ position, target }: { position: [number, number, number]; target: [number, number, number] }) {
  const p = useMemo(() => new THREE.Vector3(...position), [position]);
  const t = useMemo(() => new THREE.Vector3(...target), [target]);
  const len = p.distanceTo(t) * 1.1;
  const q = useMemo(
    () => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), t.clone().sub(p).normalize()),
    [p, t],
  );
  const mid = useMemo(() => p.clone().addScaledVector(t.clone().sub(p).normalize(), len / 2), [p, t, len]);
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: beamVertex,
        fragmentShader: beamFragment,
        uniforms: { uColor: { value: new THREE.Color("#cfe2ff") }, uStrength: { value: 0.09 } },
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    [],
  );
  const spot = useRef<THREE.SpotLight>(null);
  useLayoutEffect(() => {
    if (spot.current) {
      spot.current.target.position.copy(t);
      spot.current.target.updateMatrixWorld();
    }
  }, [t]);
  return (
    <group>
      <mesh position={[p.x, p.y / 2, p.z]} castShadow>
        <cylinderGeometry args={[0.12, 0.18, p.y, 8]} />
        <meshStandardMaterial color="#4a4f57" roughness={0.7} metalness={0.4} />
      </mesh>
      <mesh position={p} quaternion={q}>
        <boxGeometry args={[1.4, 0.3, 0.8]} />
        <meshBasicMaterial color={[3, 3.2, 3.6]} toneMapped={false} />
      </mesh>
      <mesh position={mid} quaternion={q} material={mat}>
        <cylinderGeometry args={[0.5, 4.5, len, 24, 1, true]} />
      </mesh>
      <spotLight
        ref={spot}
        position={p}
        angle={0.32}
        penumbra={0.6}
        intensity={420}
        distance={120}
        decay={1.6}
        color="#d9e6ff"
      />
    </group>
  );
}

export interface LaunchPadProps {
  /** 0..1: service arms swing away from the rocket. */
  armsOpen: { current: number };
  /** Red warning strobes (scrub). */
  alarm: { current: boolean };
}

/** Pad, tower, service arms, floodlights and warning beacons. Rocket stands at the origin. */
export function LaunchPad({ armsOpen, alarm }: LaunchPadProps) {
  const arms = useRef<THREE.Group[]>([]);
  const beacons = useRef<THREE.MeshBasicMaterial[]>([]);
  const alarmLight = useRef<THREE.PointLight>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    arms.current.forEach((g, i) => {
      if (g) g.rotation.y = (i % 2 === 0 ? 1 : -1) * armsOpen.current * 1.25;
    });
    const blink = Math.sin(t * 3.2) > 0.6 ? 1 : 0.15;
    const strobe = alarm.current && Math.sin(t * 14) > 0;
    beacons.current.forEach((m) => m?.color.setRGB(alarm.current ? (strobe ? 8 : 0.4) : 3 * blink, 0.08, 0.05));
    if (alarmLight.current) alarmLight.current.intensity = strobe ? 120 : 0;
  });

  const armHeights = [ROCKET_HEIGHT - 4.5, ROCKET_HEIGHT - 13];
  return (
    <group>
      {/* Ground and pad */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[900, 64]} />
        <meshStandardMaterial color="#191c20" roughness={1} />
      </mesh>
      <mesh position={[0, 0.25, 0]} receiveShadow castShadow>
        <boxGeometry args={[26, 0.5, 26]} />
        <meshStandardMaterial color="#5a5d62" roughness={0.95} />
      </mesh>
      {/* Launch mount and flame trench */}
      <mesh position={[0, 0.5 + 1.1, 0]} castShadow receiveShadow>
        <boxGeometry args={[4.2, 2.2, 4.2]} />
        <meshStandardMaterial color="#6d7076" roughness={0.8} metalness={0.2} />
      </mesh>
      <mesh position={[0, 0.51, 7]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[3.4, 10]} />
        <meshStandardMaterial color="#08090b" roughness={1} />
      </mesh>
      <mesh position={[0, 0.51, -7]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[3.4, 10]} />
        <meshStandardMaterial color="#08090b" roughness={1} />
      </mesh>

      <Tower />
      {armHeights.map((y, i) => (
        <group key={y} position={[-3.6 + 1.3, y, 0]} ref={(g) => void (g && (arms.current[i] = g))}>
          <mesh position={[0.95, 0, 0]} castShadow>
            <boxGeometry args={[1.9, 0.5, 0.9]} />
            <meshStandardMaterial color="#7d838c" roughness={0.6} metalness={0.5} />
          </mesh>
        </group>
      ))}

      {/* Warning beacons on the tower top and pad corners */}
      {(
        [
          [-3.6, ROCKET_HEIGHT + 12.2, 0],
          [-3.6 - 1.3, ROCKET_HEIGHT + 5.2, -1.3],
          [12.5, 0.9, 12.5],
          [-12.5, 0.9, 12.5],
          [12.5, 0.9, -12.5],
        ] as [number, number, number][]
      ).map((p, i) => (
        <mesh key={i} position={p}>
          <sphereGeometry args={[0.22, 12, 12]} />
          <meshBasicMaterial
            ref={(m) => void (m && (beacons.current[i] = m))}
            color={[3, 0.08, 0.05]}
            toneMapped={false}
          />
        </mesh>
      ))}
      <pointLight ref={alarmLight} position={[0, 6, 6]} color="#ff2a1a" intensity={0} distance={60} decay={1.5} />

      <Floodlight position={[16, 14, 14]} target={[0, 12, 0]} />
      <Floodlight position={[-14, 12, 18]} target={[0, 9, 0]} />
      <Floodlight position={[4, 16, -20]} target={[0, 14, 0]} />
    </group>
  );
}

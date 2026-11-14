import { Stars, useTexture } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Bloom, EffectComposer, Noise, ToneMapping, Vignette } from "@react-three/postprocessing";
import { orbitTypes } from "@space-mission/data";
import { orbitState, resolveOrbit, type Design } from "@space-mission/sim";
import { BlendFunction, ToneMappingMode } from "postprocessing";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { SpaceReflections, useReducedMotion } from "./common.tsx";
import { EARTH_DAY_URL, EARTH_NIGHT_URL, Earth, SunGlow } from "./Earth.tsx";
import { Flame, Particles, type Spawn } from "./effects.tsx";
import { LaunchPad } from "./LaunchPad.tsx";
import { FAIRING_BASE, FairingHalf, FirstStage, ROCKET, SecondStage } from "./Rocket.tsx";
import { Satellite } from "./Satellite.tsx";
import { spacecraftLook, type SpacecraftLook } from "./spacecraftLook.ts";
import "./launch.css";

useTexture.preload([EARTH_DAY_URL, EARTH_NIGHT_URL]);

/* ---------- Timeline (seconds from the start of the sequence) ---------- */
const COUNT_FROM = 5;
const IGNITION = 5.0;
const LIFTOFF = 5.8;
const ARMS = [1.8, 3.2] as const;
const ACCEL = 9; // m/s^2, visual only
const CHASE = LIFTOFF + 2.8;
const SPACE_START = LIFTOFF + 6.6;
const SECO = 2.0; // relative to SPACE_START
const FAIRING_SEP = 2.6;
const SC_SEP = 4.3;
const DEPLOY = 5.3;
const ORBIT = 7.0;
const DONE_PASS = SPACE_START + 10;
const HOLD = 3.0;
const DONE_FAIL = 9.5;
const EXPLODE = LIFTOFF + 4.2;
const DONE_ANOMALY = EXPLODE + 6;
const MOUNT_TOP = 2.7;
const PAD_SUN = new THREE.Vector3(-0.55, 0.07, -0.83).normalize();
const SPACE_SUN = new THREE.Vector3(-0.7, 0.16, -0.7).normalize();

const smooth = (a: number, b: number, x: number) => {
  const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const ascentY = (t: number) => (t > LIFTOFF ? 0.5 * ACCEL * (t - LIFTOFF) ** 2 : 0);

/* ---------- Sky ---------- */

const skyVertex = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    vec4 wp = modelMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;
const skyFragment = /* glsl */ `
  uniform vec3 uSun;
  uniform float uSpace;
  varying vec3 vDir;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
  void main() {
    vec3 d = normalize(vDir);
    float h = d.y;
    vec3 horizon = vec3(1.0, 0.46, 0.22);
    vec3 mid = vec3(0.16, 0.17, 0.34);
    vec3 zenith = vec3(0.012, 0.025, 0.08);
    vec3 col = mix(horizon, mid, smoothstep(-0.02, 0.2, h));
    col = mix(col, zenith, smoothstep(0.18, 0.75, h));
    float sd = max(dot(d, uSun), 0.0);
    col += vec3(1.0, 0.5, 0.2) * pow(sd, 6.0) * 0.55 * smoothstep(0.5, -0.05, h);
    col += vec3(1.0, 0.75, 0.5) * pow(sd, 900.0) * 6.0;
    col = mix(col, vec3(0.03, 0.03, 0.04), smoothstep(0.0, -0.06, h));

    vec3 space = vec3(0.0, 0.001, 0.006) + vec3(0.25, 0.5, 1.0) * exp(-abs(h + 0.12) * 18.0) * 0.5;
    col = mix(col, space, uSpace);

    vec2 g = vec2(atan(d.z, d.x), asin(clamp(h, -1.0, 1.0))) * 160.0;
    vec2 cell = floor(g);
    vec2 f = fract(g) - vec2(hash(cell), hash(cell + 7.1));
    float star = step(0.975, hash(cell + 3.3)) * smoothstep(0.09, 0.0, length(f));
    float vis = smoothstep(0.25, 0.7, h) * 0.5 + uSpace;
    col += vec3(0.9, 0.95, 1.0) * star * vis * (0.4 + hash(cell + 1.7));
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function Sky({ space }: { space: { current: number } }) {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: skyVertex,
        fragmentShader: skyFragment,
        uniforms: { uSun: { value: PAD_SUN }, uSpace: { value: 0 } },
        side: THREE.BackSide,
        depthWrite: false,
      }),
    [],
  );
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ camera, scene }) => {
    ref.current?.position.copy(camera.position);
    mat.uniforms.uSpace!.value = space.current;
    if (scene.fog instanceof THREE.Fog) {
      scene.fog.color.setRGB(0.34, 0.24, 0.27).lerp(new THREE.Color(0, 0, 0), space.current);
    }
  });
  return (
    <mesh ref={ref} material={mat} renderOrder={-10} frustumCulled={false}>
      <sphereGeometry args={[1500, 48, 24]} />
    </mesh>
  );
}

/* ---------- Pad phase ---------- */

interface PhaseProps {
  clock: () => number;
  mode: Mode;
  reduced: boolean;
}

/** orbit: PASS; scrub: held on the pad (design review failed); anomaly: the vehicle fails in flight. */
type Mode = "orbit" | "scrub" | "anomaly";

function PadPhase({ clock, mode, reduced }: PhaseProps) {
  const flies = mode !== "scrub";
  const scrub = mode === "scrub";
  const anomaly = mode === "anomaly";
  const flash = useRef<THREE.PointLight>(null);
  const fireball = useRef<THREE.Mesh>(null);
  const boomAt = useMemo(() => new THREE.Vector3(), []);
  const { camera } = useThree();
  const rocket = useRef<THREE.Group>(null);
  const power = useRef(0);
  const spread = useRef(1);
  const space = useRef(0);
  const arms = useRef(0);
  const alarm = useRef(false);
  const engineLight = useRef<THREE.PointLight>(null);
  const nozzle = useMemo(() => new THREE.Vector3(0, MOUNT_TOP, 0), []);
  const fire = useMemo(() => ({ pos: nozzle, strength: power }), [nozzle]);
  const look = useRef(new THREE.Vector3(0, 13, 0));
  const tmp = useMemo(() => new THREE.Vector3(), []);

  useFrame((_, dt) => {
    const t = clock();
    const y = flies ? ascentY(anomaly ? Math.min(t, EXPLODE) : t) : 0;
    const exploded = anomaly && t >= EXPLODE;
    const s = Math.max(0, t - LIFTOFF);
    power.current = flies && !exploded ? smooth(IGNITION, IGNITION + 0.5, t) : 0;
    spread.current = 1 + smooth(LIFTOFF + 3, SPACE_START, t) * 1.6;
    space.current = mode === "orbit" ? smooth(LIFTOFF + 2.5, SPACE_START + 0.3, t) : 0;
    arms.current = smooth(ARMS[0], ARMS[1], t) * (flies ? 1 : 0.35);
    alarm.current = ((scrub && t > HOLD) || exploded) && !reduced;

    const pitch = smooth(LIFTOFF + 2.5, SPACE_START, t) * 0.35;
    if (rocket.current) {
      rocket.current.position.set(-Math.sin(pitch) * y * 0.3, MOUNT_TOP + y, 0);
      rocket.current.rotation.z = pitch;
      rocket.current.visible = !exploded;
      if (!exploded) boomAt.copy(rocket.current.position).add(tmp.set(0, 12, 0));
      nozzle.set(0, -0.75, 0).applyEuler(rocket.current.rotation).add(rocket.current.position);
    }
    if (fireball.current) {
      const k = exploded ? (t - EXPLODE) / 1.1 : 1;
      fireball.current.visible = exploded && k < 1;
      fireball.current.position.copy(boomAt);
      fireball.current.scale.setScalar(2 + 16 * Math.sqrt(k));
      (fireball.current.material as THREE.MeshBasicMaterial).opacity = Math.pow(1 - Math.min(k, 1), 1.5);
    }
    if (flash.current) {
      flash.current.position.copy(boomAt);
      flash.current.intensity = exploded ? 6000 * Math.exp(-(t - EXPLODE) * 2.2) : 0;
    }
    if (engineLight.current) {
      engineLight.current.position.copy(nozzle).y -= 2;
      engineLight.current.intensity = power.current * (900 + 250 * Math.sin(t * 47) * Math.sin(t * 13));
    }

    // Camera: slow orbit on the pad, a low ground shot at liftoff, then a chase camera.
    const rp = rocket.current?.position ?? tmp.set(0, MOUNT_TOP, 0);
    const target = new THREE.Vector3();
    const lookAt = new THREE.Vector3();
    let k = 2.5;
    if (!flies || t < LIFTOFF) {
      const a = 0.5 - t * 0.03;
      const r = 54 - Math.min(t, 6) * 2 - (scrub ? smooth(HOLD, HOLD + 4, t) * 8 : 0);
      target.set(Math.sin(a) * r, 3.5 + t * 0.4, Math.cos(a) * r);
      lookAt.set(0, 13, 0);
      k = 6;
    } else if (t < CHASE) {
      target.set(20, 2.2, 27);
      lookAt.copy(rp).add(tmp.set(0, 12, 0));
      k = 3;
    } else {
      target.copy(rp).add(tmp.set(9, -7 - s * 0.4, 15));
      lookAt.copy(rp).add(tmp.set(0, 14, 0));
      k = 5;
    }
    const f = 1 - Math.exp(-k * Math.min(dt, 0.05));
    if (reduced) {
      camera.position.copy(target);
      look.current.copy(lookAt);
    } else {
      camera.position.lerp(target, f);
      look.current.lerp(lookAt, Math.min(1, f * 2));
    }
    const boomShake = exploded ? Math.exp(-(t - EXPLODE) * 1.5) * 0.8 : 0;
    if (!reduced && (power.current > 0 || boomShake > 0.01)) {
      const amp = power.current * 0.22 * Math.max(0.15, 1 - y / 120) + boomShake;
      camera.position.x += (Math.random() - 0.5) * amp;
      camera.position.y += (Math.random() - 0.5) * amp;
    }
    camera.lookAt(look.current);
  });

  const groundSmoke = (dt: number, spawn: Spawn) => {
    const p = power.current;
    const y = ascentY(clock());
    if (p < 0.05 || y > 90) return;
    const n = Math.floor(dt * 160 * p * (1 - y / 90) + Math.random());
    for (let i = 0; i < n; i++) {
      const dir = Math.random() < 0.5 ? 1 : -1;
      spawn(
        (Math.random() - 0.5) * 3,
        1.2 + Math.random(),
        dir * (4 + Math.random() * 3),
        (Math.random() - 0.5) * 9,
        1.5 + Math.random() * 4,
        dir * (16 + Math.random() * 14),
        3 + Math.random() * 2.5,
        4.5 + Math.random() * 3.5,
        0.7,
      );
    }
    // Billowing cloud around the mount.
    if (Math.random() < p * dt * 40) {
      const a = Math.random() * Math.PI * 2;
      spawn(Math.cos(a) * 3, 1.5, Math.sin(a) * 3, Math.cos(a) * 7, 3 + Math.random() * 3, Math.sin(a) * 7, 4, 5, 0.5);
    }
  };
  const trail = (dt: number, spawn: Spawn) => {
    const t = clock();
    if (t < LIFTOFF + 0.4 || power.current < 0.1) return;
    const n = Math.floor(dt * 110 + Math.random());
    for (let i = 0; i < n; i++) {
      spawn(
        nozzle.x + (Math.random() - 0.5) * 0.8,
        nozzle.y - 4 - Math.random() * 4,
        nozzle.z + (Math.random() - 0.5) * 0.8,
        (Math.random() - 0.5) * 2.5,
        -6 - Math.random() * 6,
        (Math.random() - 0.5) * 2.5,
        1.6 + Math.random(),
        5 + Math.random() * 2,
        0.5,
      );
    }
  };
  const vent = (dt: number, spawn: Spawn) => {
    const t = clock();
    if (flies && t > LIFTOFF) return;
    const rate = !scrub ? 10 : t > HOLD ? 55 : 12;
    const n = Math.floor(dt * rate + Math.random());
    const ry = (rocket.current?.position.y ?? MOUNT_TOP) + ROCKET.stage1 - 0.6;
    for (let i = 0; i < n; i++) {
      const side = Math.random() < 0.6 ? 1 : -1;
      spawn(
        side * 0.95,
        ry + Math.random() * 0.6,
        0.3,
        side * (1.2 + Math.random() * 1.5),
        -0.3,
        (Math.random() - 0.5) * 1.2,
        0.5,
        2.6 + Math.random(),
        0,
      );
    }
  };

  // Fireball and debris smoke when the vehicle fails in flight.
  const boom = (_dt: number, spawn: Spawn) => {
    const t = clock();
    if (!anomaly || t < EXPLODE || t > EXPLODE + 1.2) return;
    const n = t < EXPLODE + 0.15 ? 60 : 6;
    for (let i = 0; i < n; i++) {
      const u = Math.random() * 2 - 1;
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      const v = 6 + Math.random() * 16;
      spawn(
        boomAt.x,
        boomAt.y,
        boomAt.z,
        r * Math.cos(a) * v,
        u * v,
        r * Math.sin(a) * v,
        2.5 + Math.random() * 3,
        3 + Math.random() * 3,
        1,
      );
    }
  };

  return (
    <>
      <fog attach="fog" args={["#57404a", 140, 900]} />
      <pointLight ref={flash} color="#ffb060" intensity={0} distance={400} decay={1.2} />
      <mesh ref={fireball} visible={false}>
        <sphereGeometry args={[1, 32, 16]} />
        <meshBasicMaterial
          color={[6, 2.6, 0.8]}
          transparent
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <Particles max={700} emit={boom} color="#4a4440" grow={1.4} drag={1.4} buoyancy={-1.2} />
      <Sky space={space} />
      <hemisphereLight args={["#6a76a8", "#21170f", 0.55]} />
      <directionalLight
        position={PAD_SUN.clone().multiplyScalar(80)}
        intensity={1.6}
        color="#ffb27a"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-30}
        shadow-camera-right={30}
        shadow-camera-top={40}
        shadow-camera-bottom={-10}
        shadow-camera-near={1}
        shadow-camera-far={200}
        shadow-bias={-0.0004}
      />
      <pointLight ref={engineLight} color="#ff9440" intensity={0} distance={160} decay={1.4} />
      <LaunchPad armsOpen={arms} alarm={alarm} />
      <group ref={rocket} position={[0, MOUNT_TOP, 0]}>
        <FirstStage />
        <group position={[0, ROCKET.stage1 + ROCKET.interstage, 0]}>
          <SecondStage />
        </group>
        <group position={[0, FAIRING_BASE, 0]}>
          <FairingHalf side={1} />
          <FairingHalf side={-1} />
        </group>
        <group position={[0, -0.75, 0]}>
          <Flame length={16} radius={0.85} power={power} spread={spread} />
        </group>
      </group>
      <Particles max={1400} emit={groundSmoke} color="#b9b2ab" grow={0.75} drag={0.75} buoyancy={1.3} fire={fire} />
      <Particles max={900} emit={trail} color="#cfc9c1" grow={1.1} drag={0.5} buoyancy={0.6} fire={fire} />
      <Particles max={300} emit={vent} color="#eef2f8" grow={1.6} drag={0.9} buoyancy={-0.6} opacity={0.6} />
    </>
  );
}

/* ---------- Space phase: fairing and spacecraft separation over the curved Earth ---------- */

function SpacePhase({ clock, reduced, look }: Omit<PhaseProps, "mode"> & { look: SpacecraftLook }) {
  const { camera } = useThree();
  const stack = useRef<THREE.Group>(null);
  const stage = useRef<THREE.Group>(null);
  const halves = useRef<(THREE.Group | null)[]>([]);
  const sat = useRef<THREE.Group>(null);
  const power = useRef(1);
  const deploy = useRef(0);
  const look = useRef(new THREE.Vector3());
  const camStart = useMemo(() => new THREE.Vector3(1.5, 2.2, 9.5), []);
  const camEnd = useMemo(() => new THREE.Vector3(5, 4.5, 19), []);
  const focus = useMemo(() => new THREE.Vector3(), []);
  const satW = useMemo(() => new THREE.Vector3(), []);

  useFrame(() => {
    const s = clock() - SPACE_START;
    power.current = s < SECO ? 1 : Math.max(0, 1 - (s - SECO) * 4);
    const fa = smooth(FAIRING_SEP, FAIRING_SEP + 1.8, s);
    const sep = Math.max(0, s - SC_SEP);
    deploy.current = THREE.MathUtils.clamp((s - DEPLOY) / 1.6, 0, 1);

    if (stack.current) stack.current.position.x = s * 0.35;
    halves.current.forEach((g, i) => {
      if (!g) return;
      const side = i === 0 ? 1 : -1;
      g.rotation.z = -side * fa * 0.9;
      g.position.set(side * fa * 2.6, fa * 1.6 + fa * fa * 1.2, 0);
    });
    if (sat.current) {
      sat.current.position.y = 1.4 + sep * 0.6;
      sat.current.rotation.y = sep * 0.1;
    }
    if (stage.current) stage.current.position.y = -sep * 0.35;

    // Follow the stack, then the spacecraft once it separates; pull back to show Earth's curve.
    const c = reduced ? 1 : smooth(0, ORBIT + 1.5, s);
    const stackX = stack.current?.position.x ?? 0;
    sat.current?.getWorldPosition(satW);
    focus.set(stackX + 2, 0, 0).lerp(satW, smooth(SC_SEP, SC_SEP + 2.5, s));
    camera.position.lerpVectors(camStart, camEnd, c).add(focus);
    look.current.copy(focus).add(new THREE.Vector3(0, -0.6 - c * 1.6, 0));
    camera.lookAt(look.current);
  });

  return (
    <>
      <color attach="background" args={["#000000"]} />
      <Stars radius={300} depth={60} count={5000} factor={5} saturation={0.1} fade speed={0} />
      <SunGlow dir={SPACE_SUN} distance={400} size={80} intensity={1.3} />
      <ambientLight intensity={0.06} />
      <directionalLight position={SPACE_SUN.clone().multiplyScalar(50)} intensity={3.4} color="#fff1df" />
      <hemisphereLight args={["#000000", "#2a5a9a", 0.5]} />
      <SpaceReflections />
      <group position={[0, -66, 0]} rotation={[0.55, -1.9, 0.12]}>
        <Earth radius={60} sunDir={SPACE_SUN} atmosphere={0.014} atmosphereIntensity={1.6} segments={160} />
      </group>
      <group ref={stack} rotation={[0, 0, -Math.PI / 2]}>
        <group ref={stage}>
          <SecondStage />
          <group position={[0, -1.25, 0]}>
            <Flame length={9} radius={0.6} power={power} hot="#f4f6ff" mid="#8fb0ff" cool="#3a4dff" diamonds={0.3} />
          </group>
        </group>
        <group position={[0, ROCKET.stage2, 0]}>
          {[1, -1].map((side, i) => (
            <group key={side} ref={(g) => void (halves.current[i] = g)}>
              <FairingHalf side={side as 1 | -1} />
            </group>
          ))}
          <group ref={sat} position={[0, 1.4, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <Satellite look={look} deploy={deploy} scale={look.size === "smallsat" ? 0.12 : 0.26} />
          </group>
        </group>
      </group>
    </>
  );
}

/* ---------- Overlay (DOM) ---------- */

const fmtClock = (secs: number) => {
  const s = Math.max(0, Math.floor(secs));
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `00:${mm}:${ss}`;
};

const EVENTS = [
  { at: LIFTOFF, label: "Liftoff" },
  { at: LIFTOFF + 4, label: "Max-Q" },
  { at: SPACE_START - 0.3, label: "Stage sep" },
  { at: SPACE_START + FAIRING_SEP, label: "Fairing" },
  { at: SPACE_START + SC_SEP, label: "Spacecraft sep" },
  { at: SPACE_START + ORBIT, label: "Orbit" },
];

export interface LaunchSceneProps {
  pass: boolean;
  missionName: string;
  /** The design: launcher and orbit come from it. */
  design: Design;
  /** How a non-PASS launch fails: held on the pad (default) or lost in flight. */
  failure?: "scrub" | "anomaly";
  /** Failed checks, shown when the launch is scrubbed. */
  reasons: string[];
  onDone: () => void;
}

/** Full-screen 3D launch: countdown, liftoff and orbit insertion (PASS) or a scrub on the pad (FAIL). */
export default function LaunchScene({
  pass,
  missionName,
  design,
  failure = "scrub",
  reasons,
  onDone,
}: LaunchSceneProps) {
  const mode: Mode = pass ? "orbit" : failure;
  const scrub = mode === "scrub";
  const reduced = useReducedMotion();
  const start = useRef(performance.now());
  const frozen = mode === "orbit" ? SPACE_START + ORBIT + 0.5 : scrub ? HOLD + 1 : EXPLODE + 1.5;
  const clock = useMemo(() => () => (reduced ? frozen : (performance.now() - start.current) / 1000), [reduced, frozen]);
  const [t, setT] = useState(0);
  const done = useRef(false);

  useEffect(() => {
    let raf = 0;
    let last = 0;
    const tick = (now: number) => {
      const elapsed = (now - start.current) / 1000;
      if (now - last > 60) {
        last = now;
        setT(clock());
      }
      const end = reduced ? 4.5 : mode === "orbit" ? DONE_PASS : scrub ? DONE_FAIL : DONE_ANOMALY;
      if (elapsed >= end && !done.current) {
        done.current = true;
        onDone();
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onDone();
    window.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKey);
    };
  }, [clock, onDone, mode, scrub, reduced]);

  const inSpace = pass && t >= SPACE_START;
  const fade = pass ? 1 - Math.min(1, Math.abs(t - SPACE_START) / 0.55) : 0;
  const s = t - SPACE_START;
  const launcher = design.launcher;
  const look = useMemo(() => spacecraftLook(design), [design]);
  const orbit = resolveOrbit(design);
  const orbitName = orbitTypes.find((o) => o.id === orbit.type)?.name ?? orbit.type;
  const v = orbitState(orbit, 0).velocity;
  const orbitalKmh = Math.hypot(v.x, v.y, v.z) * 3600;

  let clockText: string;
  if (scrub && t >= HOLD) clockText = `HOLD  T−${fmtClock(COUNT_FROM - HOLD)}`;
  else if (t < LIFTOFF - 0.8 || scrub) clockText = `T−${fmtClock(Math.ceil(COUNT_FROM - t))}`;
  else clockText = `T+${fmtClock(t - LIFTOFF)}`;

  // Stylised ascent telemetry: climbs to orbit altitude and speed by the end of the sequence.
  const tt = mode === "anomaly" ? Math.min(t, EXPLODE) : t;
  const prog = !scrub ? THREE.MathUtils.clamp((tt - LIFTOFF) / (SPACE_START + ORBIT - LIFTOFF), 0, 1) : 0;
  const altKm = t < LIFTOFF ? 0 : orbit.altitudeKm * Math.pow(prog, 1.6);
  const speed = t < LIFTOFF ? 0 : orbitalKmh * Math.pow(prog, 1.25);

  let callout = "";
  if (mode === "anomaly" && t >= EXPLODE) callout = "Vehicle anomaly · loss of signal";
  else if (scrub)
    callout = t >= HOLD ? "Hold, hold, hold" : t > ARMS[0] ? "Terminal count" : "Final polls: go for launch?";
  else if (t < ARMS[0]) callout = "Final polls complete · go for launch";
  else if (t < IGNITION) callout = "Terminal count · arms retracting";
  else if (t < LIFTOFF) callout = "Ignition";
  else if (t < LIFTOFF + 3) callout = "Liftoff!";
  else if (!inSpace) callout = "Vehicle is supersonic · max-Q";
  else if (s < SECO) callout = "Second stage burn";
  else if (s < FAIRING_SEP) callout = "Engine cutoff";
  else if (s < SC_SEP) callout = "Fairing separation confirmed";
  else if (s < DEPLOY) callout = "Spacecraft separation";
  else if (s < ORBIT) callout = "Solar arrays deploying";
  else callout = `${missionName} is in orbit`;

  return (
    <div className="ls" onClick={onDone} role="dialog" aria-label="Launch sequence">
      <Canvas
        shadows
        dpr={[1, 1.5]}
        camera={{ position: [30, 6, 30], fov: 42, near: 0.1, far: 4000 }}
        gl={{ antialias: false, powerPreference: "high-performance" }}
      >
        <Suspense fallback={null}>
          {inSpace ? (
            <SpacePhase clock={clock} reduced={reduced} look={look} />
          ) : (
            <PadPhase clock={clock} mode={mode} reduced={reduced} />
          )}
          <EffectComposer multisampling={4}>
            <Bloom mipmapBlur luminanceThreshold={0.9} luminanceSmoothing={0.15} intensity={1.15} radius={0.75} />
            <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
            <Vignette eskil={false} offset={0.2} darkness={0.8} />
            <Noise premultiply blendFunction={BlendFunction.SCREEN} opacity={0.12} />
          </EffectComposer>
        </Suspense>
      </Canvas>

      <div className="ls-fade" style={{ opacity: fade }} />
      <div className="ls-letterbox top" />
      <div className="ls-letterbox bottom" />

      <div className="ls-hud">
        <div className="ls-head">
          <div>
            <div className="ls-kicker">{missionName}</div>
            <div className="ls-vehicle">{launcher?.name ?? "Launch vehicle"}</div>
          </div>
          <div className={`ls-clock ${scrub && t >= HOLD ? "hold" : ""}`}>{clockText}</div>
          <div className="ls-head-right">
            {orbit.altitudeKm} km · {orbitName}
          </div>
        </div>

        {!scrub && (
          <div className="ls-telemetry">
            <div>
              <span>Stage</span>
              <b>{inSpace ? 2 : 1}</b>
            </div>
            <div>
              <span>Speed</span>
              <b>{Math.round(speed).toLocaleString("en-US")}</b> km/h
            </div>
            <div>
              <span>Altitude</span>
              <b>{altKm.toFixed(altKm < 100 ? 1 : 0)}</b> km
            </div>
          </div>
        )}

        <div className={`ls-callout ${callout ? "show" : ""}`} key={callout}>
          {callout}
        </div>

        {pass && (
          <div className="ls-events">
            {EVENTS.map((e) => (
              <div key={e.label} className={`ls-event ${t >= e.at ? "done" : ""}`}>
                <i />
                <span>{e.label}</span>
              </div>
            ))}
          </div>
        )}

        {((scrub && t >= HOLD + 0.4) || (mode === "anomaly" && t >= EXPLODE + 1.2)) && (
          <div className="ls-scrub">
            <div className="ls-scrub-title">{scrub ? "Launch scrubbed" : "Launch failure"}</div>
            <div className="ls-scrub-sub">
              {scrub
                ? "The design review did not pass. Fix these and try again:"
                : "The vehicle was lost during ascent:"}
            </div>
            <ul>
              {reasons.slice(0, 4).map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="ls-skip">Click or press Esc to skip</div>
      </div>
    </div>
  );
}

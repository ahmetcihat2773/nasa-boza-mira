import { Line, OrbitControls, Stars } from "@react-three/drei";
import { orbitTypes } from "@space-mission/data";
import { Canvas, useFrame } from "@react-three/fiber";
import { Bloom, EffectComposer, Vignette } from "@react-three/postprocessing";
import {
  DEFAULT_GROUND_STATIONS,
  DEFAULT_MIN_ELEVATION_DEG,
  EARTH_RADIUS_KM,
  coverageHalfAngleRad,
  earthRotationRad,
  elevationDeg,
  geodeticToInertial,
  orbitState,
  orbitalPeriodS,
  resolveOrbit,
  swathWidthKm,
  type CircularOrbit,
  type Design,
} from "@space-mission/sim";
import { Suspense, useMemo, useRef, useState, type ComponentRef } from "react";
import * as THREE from "three";
import { SpaceReflections, toScene, useReducedMotion } from "./common.tsx";
import { Earth, SunGlow } from "./Earth.tsx";
import { LunarOrbitScene } from "./LunarOrbitScene.tsx";
import { LUNAR_ALTITUDE_RANGE_KM, lunarOrbitalPeriodS, type Destination } from "./lunar.ts";
import { Satellite, lookScale } from "./Satellite.tsx";
import { spacecraftLook, type SpacecraftLook } from "./spacecraftLook.ts";
import "./scene.css";

/** Sun direction in scene space: lights most of the visible disc and leaves a night crescent with city lights. */
export const SUN_DIR = new THREE.Vector3(0.95, 0.3, -0.5).normalize();
/** One orbit in about 40 seconds. */
const ORBITS_PER_MINUTE = 1.5;
/** Placeholder instrument field of view until the player picks an instrument, degrees. */
export const PLACEHOLDER_FOV_DEG = 30;
const MIN_ELEVATION_DEG = DEFAULT_MIN_ELEVATION_DEG;

export interface StationSite {
  name: string;
  latDeg: number;
  lonDeg: number;
}
const shortName = (n: string) => n.split(",")[0]!;

type LineObj = ComponentRef<typeof Line>;
interface LineGeo {
  setColors(a: Float32Array): void;
  setPositions(a: number[]): void;
}

const ORBIT_SAMPLES = 256;
const SWATH_SAMPLES = 48;
const SAT_SCALE = 0.016;
/** Over-bright green so the link line blooms. */
const LINK_COLOR = new THREE.Color(0.5, 2.2, 1.1);

function stationLocal(s: StationSite, r = 1.0015): THREE.Vector3 {
  // Earth-fixed position (rotation angle 0) in scene axes.
  return toScene(geodeticToInertial(s.latDeg, s.lonDeg, 0)).multiplyScalar(r);
}

function StationMarker({ station, coverage, active }: { station: StationSite; coverage: number; active: boolean }) {
  const pos = useMemo(() => stationLocal(station), [station]);
  const ring = useMemo(() => {
    const s = pos.clone().normalize();
    const e1 = new THREE.Vector3(0, 1, 0).cross(s).normalize();
    const e2 = s.clone().cross(e1);
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 96; i++) {
      const a = (i / 96) * Math.PI * 2;
      const dir = e1
        .clone()
        .multiplyScalar(Math.cos(a))
        .addScaledVector(e2, Math.sin(a))
        .multiplyScalar(Math.sin(coverage))
        .addScaledVector(s, Math.cos(coverage));
      pts.push(dir.multiplyScalar(1.002));
    }
    return pts;
  }, [pos, coverage]);
  const pulse = useRef<THREE.Mesh>(null);
  const quat = useMemo(
    () => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), pos.clone().normalize()),
    [pos],
  );
  useFrame(({ clock }) => {
    if (!pulse.current) return;
    const k = (clock.elapsedTime * 0.6) % 1;
    pulse.current.scale.setScalar(0.4 + k * 2.2);
    (pulse.current.material as THREE.MeshBasicMaterial).opacity = (1 - k) * 0.8;
  });
  const color = active ? "#5dffa8" : "#3ddc84";
  return (
    <group>
      <mesh position={pos}>
        <sphereGeometry args={[0.011, 16, 16]} />
        <meshBasicMaterial color={active ? [0.8, 3, 1.6] : [0.4, 1.6, 0.8]} toneMapped={false} />
      </mesh>
      <mesh ref={pulse} position={pos} quaternion={quat}>
        <ringGeometry args={[0.018, 0.024, 48]} />
        <meshBasicMaterial color={color} transparent depthWrite={false} side={THREE.DoubleSide} toneMapped={false} />
      </mesh>
      <Line
        points={ring}
        color={color}
        lineWidth={1}
        transparent
        opacity={active ? 0.75 : 0.28}
        dashed
        dashSize={0.02}
        gapSize={0.012}
      />
    </group>
  );
}

interface SceneProps {
  orbit: CircularOrbit;
  swathKm: number;
  stations: readonly StationSite[];
  look: SpacecraftLook;
  reduced: boolean;
  contact: string;
  onContact: (names: string) => void;
}

function OrbitScene({ orbit, swathKm, stations, look, reduced, contact, onContact }: SceneProps) {
  const period = orbitalPeriodS(orbit.altitudeKm);
  const timeScale = (period * ORBITS_PER_MINUTE) / 60;
  // Start just before a pass over Svalbard so contact shows soon.
  const simT = useRef(period * 0.9);
  const coverage = coverageHalfAngleRad(orbit.altitudeKm, MIN_ELEVATION_DEG);

  const earth = useRef<THREE.Group>(null);
  const sat = useRef<THREE.Group>(null);
  const orbitLine = useRef<LineObj>(null);
  const links = useRef<(LineObj | null)[]>([]);
  const contactKey = useRef("");

  const orbitPoints = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= ORBIT_SAMPLES; i++)
      pts.push(toScene(orbitState(orbit, (i / ORBIT_SAMPLES) * period).position));
    return pts;
  }, [orbit, period]);
  const orbitColors = useMemo(() => new Float32Array((ORBIT_SAMPLES + 1) * 3), []);

  // Swath ribbon (Earth-fixed, child of the Earth group) and the instrument's view cone.
  const swathGeo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(SWATH_SAMPLES * 2 * 3), 3));
    const fade = new Float32Array(SWATH_SAMPLES * 2 * 2);
    const idx: number[] = [];
    for (let k = 0; k < SWATH_SAMPLES; k++) {
      const a = Math.pow(1 - k / (SWATH_SAMPLES - 1), 1.6);
      fade.set([a, 0, a, 1], k * 4);
      if (k < SWATH_SAMPLES - 1) {
        const i = k * 2;
        idx.push(i, i + 1, i + 2, i + 1, i + 3, i + 2);
      }
    }
    g.setAttribute("aFade", new THREE.BufferAttribute(fade, 2));
    g.setIndex(idx);
    return g;
  }, []);
  const coneGeo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(5 * 3), 3));
    g.setAttribute(
      "aFade",
      new THREE.BufferAttribute(new Float32Array([0.05, 0.5, 1, 0.5, 1, 0.5, 1, 0.5, 1, 0.5]), 2),
    );
    g.setIndex([0, 1, 2, 0, 2, 3, 0, 3, 4, 0, 4, 1]);
    return g;
  }, []);
  const swathMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: `attribute vec2 aFade; varying vec2 vF; void main(){ vF = aFade; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `uniform float uGain; varying vec2 vF; void main(){
          float edge = 0.55 + 0.9 * pow(abs(vF.y * 2.0 - 1.0), 6.0);
          gl_FragColor = vec4(vec3(1.0, 0.55, 0.12) * (0.8 + 0.6 * edge), clamp(vF.x * edge * uGain, 0.0, 1.0)); }`,
        uniforms: { uGain: { value: 0.7 } },
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -2,
      }),
    [],
  );
  const coneMat = useMemo(() => {
    const m = swathMat.clone();
    m.uniforms.uGain = { value: 0.18 };
    m.blending = THREE.AdditiveBlending;
    return m;
  }, [swathMat]);

  const tmp = useMemo(
    () => ({
      p: new THREE.Vector3(),
      v: new THREE.Vector3(),
      x: new THREE.Vector3(),
      y: new THREE.Vector3(),
      z: new THREE.Vector3(),
      m: new THREE.Matrix4(),
      c: new THREE.Vector3(),
      a: new THREE.Vector3(),
      st: new THREE.Vector3(),
    }),
    [],
  );

  useFrame((_, dt) => {
    if (!reduced) simT.current += Math.min(dt, 0.1) * timeScale;
    const t = simT.current;
    const theta = earthRotationRad(t);
    if (earth.current) earth.current.rotation.y = theta;

    const s = orbitState(orbit, t);
    const p = toScene(s.position, tmp.p);
    const v = toScene(s.velocity, tmp.v).normalize();
    if (sat.current) {
      sat.current.position.copy(p);
      tmp.y.copy(p).normalize();
      tmp.z.copy(v);
      tmp.x.crossVectors(tmp.y, tmp.z).normalize();
      tmp.m.makeBasis(tmp.x, tmp.y, tmp.z);
      sat.current.quaternion.setFromRotationMatrix(tmp.m);
    }

    // Orbit line: bright fading trail behind the satellite, faint ahead.
    const phase = (((t / period) % 1) + 1) % 1;
    for (let i = 0; i <= ORBIT_SAMPLES; i++) {
      const d = (((phase - i / ORBIT_SAMPLES) % 1) + 1) % 1;
      const trail = Math.exp(-d * 5);
      const k = 0.32 + 1.9 * trail;
      orbitColors[i * 3] = (0.25 + 0.5 * trail) * k;
      orbitColors[i * 3 + 1] = (0.62 + 0.3 * trail) * k;
      orbitColors[i * 3 + 2] = 1.0 * k;
    }
    (orbitLine.current?.geometry as unknown as LineGeo | undefined)?.setColors(orbitColors);

    // Swath: sub-satellite points over the last few minutes, in Earth-fixed axes.
    const hw = swathKm / 2 / EARTH_RADIUS_KM;
    const pos = swathGeo.getAttribute("position") as THREE.BufferAttribute;
    const stepS = (period * 0.07) / SWATH_SAMPLES;
    for (let k = 0; k < SWATH_SAMPLES; k++) {
      const tk = t - k * stepS;
      const sk = orbitState(orbit, tk);
      const back = -earthRotationRad(tk);
      const g = toScene(sk.position, tmp.a).normalize().applyAxisAngle(THREE.Object3D.DEFAULT_UP, back);
      const vel = toScene(sk.velocity, tmp.c).applyAxisAngle(THREE.Object3D.DEFAULT_UP, back);
      const cross = vel.cross(g).normalize().multiplyScalar(hw);
      tmp.x.copy(g).add(cross).setLength(1.0015);
      tmp.z.copy(g).sub(cross).setLength(1.0015);
      pos.setXYZ(k * 2, tmp.x.x, tmp.x.y, tmp.x.z);
      pos.setXYZ(k * 2 + 1, tmp.z.x, tmp.z.y, tmp.z.z);
    }
    pos.needsUpdate = true;
    swathGeo.computeBoundingSphere();

    // View cone from the satellite to the current swath edges (inertial axes).
    const sub = tmp.a.copy(p).normalize();
    const crossI = tmp.c.copy(v).cross(sub).normalize().multiplyScalar(hw);
    const along = tmp.st.copy(v).multiplyScalar(hw * 0.12);
    const cp = coneGeo.getAttribute("position") as THREE.BufferAttribute;
    cp.setXYZ(0, p.x, p.y, p.z);
    const corners: [number, number][] = [
      [1, 1],
      [-1, 1],
      [-1, -1],
      [1, -1],
    ];
    corners.forEach(([cs, as], i) => {
      tmp.x.copy(sub).addScaledVector(crossI, cs).addScaledVector(along, as).setLength(1.0015);
      cp.setXYZ(i + 1, tmp.x.x, tmp.x.y, tmp.x.z);
    });
    cp.needsUpdate = true;
    coneGeo.computeBoundingSphere();

    // Ground station contact (elevation from the sim) and link lines.
    const inContact: string[] = [];
    stations.forEach((gs, i) => {
      const el = elevationDeg(geodeticToInertial(gs.latDeg, gs.lonDeg, t), s.position);
      const line = links.current[i];
      const on = el >= MIN_ELEVATION_DEG;
      if (on) inContact.push(gs.name);
      if (!line) return;
      line.visible = on;
      if (on) {
        const w = toScene(geodeticToInertial(gs.latDeg, gs.lonDeg, t), tmp.st).multiplyScalar(1.0015);
        (line.geometry as unknown as LineGeo).setPositions([w.x, w.y, w.z, p.x, p.y, p.z]);
        line.computeLineDistances();
        line.material.dashOffset -= dt * 0.25;
      }
    });
    const key = inContact.join("|");
    if (key !== contactKey.current) {
      contactKey.current = key;
      onContact(key);
    }
  });

  return (
    <>
      <ambientLight intensity={0.08} />
      <directionalLight position={SUN_DIR.clone().multiplyScalar(10)} intensity={3.2} color="#fff3e2" />
      <SpaceReflections />
      <Stars radius={60} depth={30} count={3500} factor={2.4} saturation={0.15} fade speed={reduced ? 0 : 0.4} />
      <SunGlow dir={SUN_DIR} distance={40} size={9} />

      <group ref={earth}>
        <Earth sunDir={SUN_DIR} atmosphere={0.028} />
        <mesh geometry={swathGeo} material={swathMat} renderOrder={2} />
        {stations.map((gs) => (
          <StationMarker key={gs.name} station={gs} coverage={coverage} active={contact.split("|").includes(gs.name)} />
        ))}
      </group>

      <Line
        ref={orbitLine}
        points={orbitPoints}
        vertexColors={Array.from({ length: orbitPoints.length }, () => [1, 1, 1] as [number, number, number])}
        lineWidth={1.6}
        transparent
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        toneMapped={false}
      />
      <mesh geometry={coneGeo} material={coneMat} renderOrder={3} />
      {stations.map((gs, i) => (
        <Line
          key={gs.name}
          ref={(l) => void (links.current[i] = l)}
          points={[
            [0, 0, 0],
            [0, 1, 0],
          ]}
          color={LINK_COLOR}
          lineWidth={1.6}
          dashed
          dashSize={0.035}
          gapSize={0.025}
          transparent
          toneMapped={false}
          visible={false}
        />
      ))}

      <group ref={sat}>
        <Satellite look={look} scale={SAT_SCALE * lookScale(look)} />
        <pointLight color="#9fd4ff" intensity={0.02} distance={0.2} />
      </group>

      <OrbitControls
        enablePan={false}
        enableDamping
        minDistance={1.5}
        maxDistance={9}
        autoRotate={!reduced}
        autoRotateSpeed={0.15}
      />
      <EffectComposer multisampling={4}>
        <Bloom mipmapBlur luminanceThreshold={0.85} luminanceSmoothing={0.2} intensity={0.9} />
        <Vignette eskil={false} offset={0.25} darkness={0.75} />
      </EffectComposer>
    </>
  );
}

interface ExplicitOrbitProps {
  /** The design's resolved orbit (computeBudget().orbit). */
  orbit: { type: string; altitudeKm: number; inclinationDeg: number };
  /** Display name of the orbit type. */
  orbitName: string;
  /** Widest instrument swath, km (computeBudget().swathKm); 0 shows a placeholder swath. */
  swathKm: number;
  stations: readonly StationSite[];
  /** The design, for the spacecraft model (a typical 6U when omitted). */
  design?: Design;
}

/**
 * Either pass the design (orbit, swath and stations are resolved with the sim),
 * or pass the already-resolved values from computeBudget().
 */
export type OrbitViewProps = ({ design: Design } | ExplicitOrbitProps) & {
  /** True once the spacecraft has launched: the view shows the live orbit instead of the planned one. */
  live: boolean;
  /** The mission's destination; "lunar-orbit" draws the Moon scene instead of Earth. */
  destination?: Destination;
};

function resolveProps(p: OrbitViewProps): ExplicitOrbitProps {
  if ("orbit" in p) return p;
  const orbit = resolveOrbit(p.design);
  return {
    orbit,
    orbitName: orbitTypes.find((o) => o.id === orbit.type)?.name ?? orbit.type,
    swathKm: Math.max(0, ...(p.design.instruments ?? []).map((i) => swathWidthKm(i.fieldOfViewDeg, orbit.altitudeKm))),
    stations: p.design.groundStations ?? DEFAULT_GROUND_STATIONS,
    design: p.design,
  };
}

/** Interactive 3D orbit view for the design and operations screens. */
export default function OrbitView(props: OrbitViewProps) {
  const { live, destination } = props;
  const lunar = destination === "lunar-orbit";
  const { orbit: o, orbitName, swathKm: designSwathKm, stations, design } = resolveProps(props);
  const look = useMemo(() => spacecraftLook(design), [design]);
  const reduced = useReducedMotion();
  const { inclinationDeg } = o;
  const altitudeKm = lunar
    ? Math.min(LUNAR_ALTITUDE_RANGE_KM.max, Math.max(LUNAR_ALTITUDE_RANGE_KM.min, o.altitudeKm))
    : o.altitudeKm;
  const orbit = useMemo<CircularOrbit>(
    () => ({ altitudeKm, inclinationDeg, raanDeg: 0 }),
    [altitudeKm, inclinationDeg],
  );
  const placeholder = designSwathKm <= 0;
  const swathKm = placeholder ? swathWidthKm(PLACEHOLDER_FOV_DEG, altitudeKm) : designSwathKm;
  const periodMin = (lunar ? lunarOrbitalPeriodS(altitudeKm) : orbitalPeriodS(altitudeKm)) / 60;
  const [contact, setContact] = useState("");

  return (
    <div className="orbit-view" id="orbit-view">
      <Canvas
        dpr={[1, 2]}
        camera={{ position: [2.5, 1.35, 2.15], fov: 40, near: 0.01, far: 200 }}
        gl={{ antialias: false, powerPreference: "high-performance" }}
        aria-label={`3D view of a ${orbitName} orbit at ${altitudeKm} km`}
      >
        <color attach="background" args={["#020409"]} />
        <Suspense fallback={null}>
          {lunar ? (
            <LunarOrbitScene
              orbit={orbit}
              // Only deep-space sites reach the Moon; near-Earth stations see nothing that far out.
              stations={stations.filter((s) => (s as { kind?: string }).kind !== "near-earth")}
              look={look}
              reduced={reduced}
              onContact={setContact}
            />
          ) : (
            <OrbitScene
              orbit={orbit}
              swathKm={swathKm}
              stations={stations}
              look={look}
              reduced={reduced}
              contact={contact}
              onContact={setContact}
            />
          )}
        </Suspense>
      </Canvas>
      <div className="ov-hud ov-top">
        <div>
          <div className="ov-kicker">{lunar ? "Lunar orbit" : "Orbit"}</div>
          <div className="ov-title">
            {orbitName} · {altitudeKm} km
          </div>
          <div className="ov-sub">
            i {inclinationDeg.toFixed(1)}° · period {periodMin.toFixed(1)} min
          </div>
        </div>
        <span className={`ov-badge ${live ? "live" : ""}`}>{live ? "● In orbit" : "Planned"}</span>
      </div>
      <div className="ov-hud ov-bottom">
        <div className="ov-stations">
          {(lunar ? stations.filter((s) => (s as { kind?: string }).kind !== "near-earth") : stations).map((g) => {
            const on = contact.split("|").includes(g.name);
            return (
              <span key={g.name} className={`ov-station ${on ? "on" : ""}`}>
                <i /> {shortName(g.name)} {on ? "· link" : ""}
              </span>
            );
          })}
        </div>
        <div className="ov-sub">
          <span className="ov-swatch" />{" "}
          {lunar
            ? "Ground track over the poles"
            : `Swath ${Math.round(swathKm)} km${placeholder ? ` (placeholder, ${PLACEHOLDER_FOV_DEG}° view)` : ""}`}
          {!reduced &&
            ` · ×${Math.round(((lunar ? lunarOrbitalPeriodS(altitudeKm) : orbitalPeriodS(altitudeKm)) * ORBITS_PER_MINUTE) / 60)} speed`}
        </div>
      </div>
    </div>
  );
}

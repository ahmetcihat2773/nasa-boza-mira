import { Line, OrbitControls, Stars } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { Bloom, EffectComposer, Vignette } from "@react-three/postprocessing";
import {
  DEFAULT_MIN_ELEVATION_DEG,
  earthRotationRad,
  elevationDeg,
  geodeticToInertial,
  type CircularOrbit,
} from "@space-mission/sim";
import { useMemo, useRef, type ComponentRef } from "react";
import * as THREE from "three";
import { SpaceReflections } from "./common.tsx";
import { Earth, SunGlow } from "./Earth.tsx";
import { MOON_ROTATION_RAD_S, lunarOrbitState, lunarOrbitalPeriodS, toMoonScene } from "./lunar.ts";
import { Moon } from "./Moon.tsx";
import type { StationSite } from "./OrbitView.tsx";
import { Satellite, lookScale } from "./Satellite.tsx";
import type { SpacecraftLook } from "./spacecraftLook.ts";

/** Sun direction: lights the near side and leaves a crisp terminator across the orbit. */
export const LUNAR_SUN_DIR = new THREE.Vector3(0.8, 0.22, 0.55).normalize();
/**
 * Earth from the Moon, in scene units (1 = Moon radius). Compressed: the real distance is 221 Moon radii;
 * Earth is drawn at its true size ratio (3.67 Moon radii) much closer so it reads in the frame.
 */
const EARTH_DIR = new THREE.Vector3(-0.72, 0.18, -0.67).normalize();
const EARTH_DISTANCE = 26;
const EARTH_RADIUS = 3.67;
/** Earth–Moon distance the station contact uses, km (the sim's value). */
const EARTH_MOON_KM = 384_400;
/** One lunar orbit in about 40 seconds. */
const ORBITS_PER_MINUTE = 1.5;
const MIN_ELEVATION_DEG = DEFAULT_MIN_ELEVATION_DEG;
const ORBIT_SAMPLES = 256;
const TRACK_SAMPLES = 220;
const SAT_SCALE = 0.03;
const LINK_COLOR = new THREE.Color(0.5, 2.2, 1.1);
const ICE_COLOR = new THREE.Color(0.55, 1.6, 2.4);

type LineObj = ComponentRef<typeof Line>;
interface LineGeo {
  setColors(a: Float32Array): void;
  setPositions(a: number[]): void;
}

/** Dashed ring at a latitude: the polar region the mission maps (permanently shadowed craters). */
function PolarCap({ latDeg, radius = 1.003 }: { latDeg: number; radius?: number }) {
  const pts = useMemo(() => {
    const lat = (latDeg * Math.PI) / 180;
    const out: THREE.Vector3[] = [];
    for (let i = 0; i <= 96; i++) {
      const a = (i / 96) * Math.PI * 2;
      out.push(new THREE.Vector3(Math.cos(lat) * Math.cos(a), Math.sin(lat), -Math.cos(lat) * Math.sin(a)).multiplyScalar(radius));
    }
    return out;
  }, [latDeg, radius]);
  return (
    <Line points={pts} color={ICE_COLOR} lineWidth={1} dashed dashSize={0.03} gapSize={0.02} transparent opacity={0.6} toneMapped={false} />
  );
}

export interface LunarSceneProps {
  orbit: CircularOrbit;
  stations: readonly StationSite[];
  look: SpacecraftLook;
  reduced: boolean;
  contact: string;
  onContact: (names: string) => void;
}

/**
 * The Moon with the spacecraft in polar orbit, its ground track over the poles (Moon-fixed),
 * Earth in the distance and the link line to it when the Moon does not block the view.
 */
export function LunarOrbitScene({ orbit, stations, look, reduced, contact, onContact }: LunarSceneProps) {
  const period = lunarOrbitalPeriodS(orbit.altitudeKm);
  const timeScale = (period * ORBITS_PER_MINUTE) / 60;
  const simT = useRef(period * 0.3);
  const moon = useRef<THREE.Group>(null);
  const earthGroup = useRef<THREE.Group>(null);
  const sat = useRef<THREE.Group>(null);
  const satLight = useRef<THREE.PointLight>(null);
  const orbitLine = useRef<LineObj>(null);
  const link = useRef<LineObj>(null);
  const contactKey = useRef("");

  const earthPos = useMemo(() => EARTH_DIR.clone().multiplyScalar(EARTH_DISTANCE), []);

  const orbitPoints = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= ORBIT_SAMPLES; i++)
      pts.push(toMoonScene(lunarOrbitState(orbit, (i / ORBIT_SAMPLES) * period).position));
    return pts;
  }, [orbit, period]);
  const orbitColors = useMemo(() => new Float32Array((ORBIT_SAMPLES + 1) * 3), []);

  // Ground track: a thin ribbon of sub-satellite points over the last ~1.4 orbits, in Moon-fixed axes.
  const trackGeo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(TRACK_SAMPLES * 2 * 3), 3));
    const fade = new Float32Array(TRACK_SAMPLES * 2 * 2);
    const idx: number[] = [];
    for (let k = 0; k < TRACK_SAMPLES; k++) {
      const a = Math.pow(1 - k / (TRACK_SAMPLES - 1), 1.2);
      fade.set([a, 0, a, 1], k * 4);
      if (k < TRACK_SAMPLES - 1) {
        const i = k * 2;
        idx.push(i, i + 1, i + 2, i + 1, i + 3, i + 2);
      }
    }
    g.setAttribute("aFade", new THREE.BufferAttribute(fade, 2));
    g.setIndex(idx);
    return g;
  }, []);
  const trackMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: `attribute vec2 aFade; varying vec2 vF; void main(){ vF = aFade; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `varying vec2 vF; void main(){
          float edge = 0.6 + 0.8 * pow(abs(vF.y * 2.0 - 1.0), 4.0);
          gl_FragColor = vec4(vec3(0.45, 1.3, 1.9) * edge, clamp(vF.x * 0.85, 0.0, 1.0)); }`,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -2,
      }),
    [],
  );

  const tmp = useMemo(
    () => ({
      p: new THREE.Vector3(),
      v: new THREE.Vector3(),
      x: new THREE.Vector3(),
      y: new THREE.Vector3(),
      z: new THREE.Vector3(),
      m: new THREE.Matrix4(),
      a: new THREE.Vector3(),
      b: new THREE.Vector3(),
      c: new THREE.Vector3(),
      d: new THREE.Vector3(),
    }),
    [],
  );

  useFrame((_, dt) => {
    if (!reduced) simT.current += Math.min(dt, 0.1) * timeScale;
    const t = simT.current;
    const moonTheta = (MOON_ROTATION_RAD_S * t) % (Math.PI * 2);
    if (moon.current) moon.current.rotation.y = moonTheta;
    if (earthGroup.current) earthGroup.current.rotation.y = earthRotationRad(t);

    const s = lunarOrbitState(orbit, t);
    const p = toMoonScene(s.position, tmp.p);
    const v = toMoonScene(s.velocity, tmp.v).normalize();
    if (sat.current) {
      sat.current.position.copy(p);
      tmp.y.copy(p).normalize();
      tmp.z.copy(v);
      tmp.x.crossVectors(tmp.y, tmp.z).normalize();
      tmp.m.makeBasis(tmp.x, tmp.y, tmp.z);
      sat.current.quaternion.setFromRotationMatrix(tmp.m);
    }
    // In the Moon's shadow: the spacecraft's own light goes out.
    const shadow = p.dot(LUNAR_SUN_DIR) < 0 && tmp.a.copy(p).addScaledVector(LUNAR_SUN_DIR, -p.dot(LUNAR_SUN_DIR)).length() < 1;
    if (satLight.current) satLight.current.intensity = shadow ? 0 : 0.03;

    // Orbit line: bright trail behind the spacecraft, faint ahead.
    const phase = (((t / period) % 1) + 1) % 1;
    for (let i = 0; i <= ORBIT_SAMPLES; i++) {
      const d = (((phase - i / ORBIT_SAMPLES) % 1) + 1) % 1;
      const trail = Math.exp(-d * 5);
      const k = 0.3 + 1.8 * trail;
      orbitColors[i * 3] = (0.3 + 0.4 * trail) * k;
      orbitColors[i * 3 + 1] = (0.7 + 0.3 * trail) * k;
      orbitColors[i * 3 + 2] = 1.0 * k;
    }
    (orbitLine.current?.geometry as unknown as LineGeo | undefined)?.setColors(orbitColors);

    // Ground track ribbon over the last 1.4 orbits (Moon-fixed).
    const pos = trackGeo.getAttribute("position") as THREE.BufferAttribute;
    const stepS = (period * 1.4) / TRACK_SAMPLES;
    const hw = 0.012;
    for (let k = 0; k < TRACK_SAMPLES; k++) {
      const tk = t - k * stepS;
      const sk = lunarOrbitState(orbit, tk);
      const back = -((MOON_ROTATION_RAD_S * tk) % (Math.PI * 2));
      const g = toMoonScene(sk.position, tmp.a).normalize().applyAxisAngle(THREE.Object3D.DEFAULT_UP, back);
      const vel = toMoonScene(sk.velocity, tmp.b).applyAxisAngle(THREE.Object3D.DEFAULT_UP, back);
      const cross = vel.cross(g).normalize().multiplyScalar(hw);
      tmp.c.copy(g).add(cross).setLength(1.004);
      tmp.d.copy(g).sub(cross).setLength(1.004);
      pos.setXYZ(k * 2, tmp.c.x, tmp.c.y, tmp.c.z);
      pos.setXYZ(k * 2 + 1, tmp.d.x, tmp.d.y, tmp.d.z);
    }
    pos.needsUpdate = true;
    trackGeo.computeBoundingSphere();

    // Link to Earth: the Moon must not block the line of sight, and a deep-space station must see the Moon.
    const toEarth = tmp.a.copy(earthPos).sub(p);
    const along = -p.dot(toEarth.clone().normalize());
    const closest = tmp.b.copy(p).addScaledVector(toEarth.normalize(), Math.max(0, along));
    const occulted = along > 0 && closest.length() < 1;
    const inContact: string[] = [];
    if (!occulted) {
      stations.forEach((gs) => {
        const site = geodeticToInertial(gs.latDeg, gs.lonDeg, t);
        // The Moon sits on the Earth frame's +x axis; the spacecraft is a hair beside it, so use the Moon's position.
        if (elevationDeg(site, { x: EARTH_MOON_KM, y: 0, z: 0 }) >= MIN_ELEVATION_DEG) inContact.push(gs.name);
      });
    }
    if (link.current) {
      const on = inContact.length > 0;
      link.current.visible = on;
      if (on) {
        (link.current.geometry as unknown as LineGeo).setPositions([p.x, p.y, p.z, earthPos.x, earthPos.y, earthPos.z]);
        link.current.computeLineDistances();
        link.current.material.dashOffset -= dt * 0.6;
      }
    }
    const key = inContact.join("|");
    if (key !== contactKey.current) {
      contactKey.current = key;
      onContact(key);
    }
  });

  return (
    <>
      <ambientLight intensity={0.05} />
      <directionalLight position={LUNAR_SUN_DIR.clone().multiplyScalar(10)} intensity={3.4} color="#fff6ea" />
      <SpaceReflections />
      <Stars radius={60} depth={30} count={3500} factor={2.4} saturation={0.15} fade speed={reduced ? 0 : 0.4} />
      <SunGlow dir={LUNAR_SUN_DIR} distance={40} size={9} />

      <group ref={moon}>
        <Moon sunDir={LUNAR_SUN_DIR} earthDir={EARTH_DIR} />
        <mesh geometry={trackGeo} material={trackMat} renderOrder={2} />
        <PolarCap latDeg={85} />
        <PolarCap latDeg={-85} />
      </group>

      {/* Earth in the distance (compressed), spinning, with its own atmosphere. */}
      <group ref={earthGroup} position={earthPos}>
        <Earth radius={EARTH_RADIUS} sunDir={LUNAR_SUN_DIR} atmosphere={0.03} atmosphereIntensity={1.2} segments={64} />
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
      <Line
        ref={link}
        points={[
          [0, 0, 0],
          [0, 1, 0],
        ]}
        color={LINK_COLOR}
        lineWidth={1.4}
        dashed
        dashSize={0.12}
        gapSize={0.08}
        transparent
        toneMapped={false}
        visible={false}
      />

      <group ref={sat}>
        <Satellite look={look} scale={SAT_SCALE * lookScale(look)} />
        <pointLight ref={satLight} color="#9fd4ff" intensity={0.03} distance={0.3} />
      </group>

      <OrbitControls
        enablePan={false}
        enableDamping
        minDistance={1.4}
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

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

/* ---------- Smoke / vapour particles ---------- */

let puffTexture: THREE.CanvasTexture | null = null;

/** A soft, lumpy cloud puff drawn once on a canvas (deterministic). */
function puff(): THREE.CanvasTexture {
  if (puffTexture) return puffTexture;
  const size = 128;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const g = c.getContext("2d")!;
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  for (let i = 0; i < 26; i++) {
    const a = rnd() * Math.PI * 2;
    const r = rnd() * size * 0.22;
    const x = size / 2 + Math.cos(a) * r;
    const y = size / 2 + Math.sin(a) * r;
    const rad = size * (0.12 + rnd() * 0.18);
    const grad = g.createRadialGradient(x, y, 0, x, y, rad);
    grad.addColorStop(0, `rgba(255,255,255,${0.22 + rnd() * 0.2})`);
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
  }
  puffTexture = new THREE.CanvasTexture(c);
  return puffTexture;
}

export interface Spawn {
  (x: number, y: number, z: number, vx: number, vy: number, vz: number, size: number, life: number, heat: number): void;
}

export interface ParticleProps {
  max: number;
  /** Called every frame to emit new particles. */
  emit: (dt: number, spawn: Spawn) => void;
  color: THREE.ColorRepresentation;
  /** Growth of the particle size per second (multiplier of the start size). */
  grow?: number;
  drag?: number;
  buoyancy?: number;
  opacity?: number;
  /** World position and strength of the engine fire that lights the smoke. */
  fire?: { pos: THREE.Vector3; strength: { current: number } };
}

const smokeVertex = /* glsl */ `
  attribute vec3 iPos;
  attribute vec4 iData; // size, alpha, heat, rotation
  varying vec2 vUv;
  varying float vAlpha;
  varying float vHeat;
  varying vec3 vWorld;
  void main() {
    vUv = uv;
    vAlpha = iData.y;
    vHeat = iData.z;
    vWorld = iPos;
    float c = cos(iData.w), s = sin(iData.w);
    vec2 p = mat2(c, s, -s, c) * position.xy * iData.x;
    vec4 mv = viewMatrix * vec4(iPos, 1.0);
    mv.xy += p;
    gl_Position = projectionMatrix * mv;
  }
`;
const smokeFragment = /* glsl */ `
  uniform sampler2D uMap;
  uniform vec3 uColor;
  uniform vec3 uFirePos;
  uniform float uFire;
  uniform float uOpacity;
  varying vec2 vUv;
  varying float vAlpha;
  varying float vHeat;
  varying vec3 vWorld;
  void main() {
    float a = texture2D(uMap, vUv).a * vAlpha * uOpacity;
    if (a < 0.003) discard;
    float d = distance(vWorld, uFirePos);
    float glow = uFire * 60.0 / (8.0 + d * d);
    vec3 col = uColor * (0.55 + 0.45 * vUv.y) + vec3(1.0, 0.5, 0.18) * glow;
    col = mix(col, vec3(1.6, 0.9, 0.45), vHeat);
    gl_FragColor = vec4(col, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/** CPU-simulated billboard particles (smoke, steam, exhaust trail). Instanced quads, no point-size limits. */
export function Particles({
  max,
  emit,
  color,
  grow = 1.2,
  drag = 0.6,
  buoyancy = 1.2,
  opacity = 1,
  fire,
}: ParticleProps) {
  const state = useMemo(() => {
    const pos = new Float32Array(max * 3);
    const vel = new Float32Array(max * 3);
    const data = new Float32Array(max * 4); // size, alpha, heat, rotation
    const age = new Float32Array(max).fill(1e9);
    const life = new Float32Array(max).fill(1);
    const size0 = new Float32Array(max);
    const heat0 = new Float32Array(max);
    const spin = new Float32Array(max);
    return { pos, vel, data, age, life, size0, heat0, spin, next: 0 };
  }, [max]);

  const geo = useMemo(() => {
    const g = new THREE.InstancedBufferGeometry();
    const base = new THREE.PlaneGeometry(1, 1);
    g.index = base.index;
    g.setAttribute("position", base.getAttribute("position"));
    g.setAttribute("uv", base.getAttribute("uv"));
    g.setAttribute("iPos", new THREE.InstancedBufferAttribute(state.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("iData", new THREE.InstancedBufferAttribute(state.data, 4).setUsage(THREE.DynamicDrawUsage));
    g.instanceCount = max;
    return g;
  }, [state, max]);

  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: smokeVertex,
        fragmentShader: smokeFragment,
        uniforms: {
          uMap: { value: puff() },
          uColor: { value: new THREE.Color(color) },
          uFirePos: { value: new THREE.Vector3() },
          uFire: { value: 0 },
          uOpacity: { value: opacity },
        },
        transparent: true,
        depthWrite: false,
      }),
    [color, opacity],
  );

  const spawn = useRef<Spawn>((x, y, z, vx, vy, vz, size, lifeS, heat) => {
    const i = state.next;
    state.next = (i + 1) % max;
    state.pos.set([x, y, z], i * 3);
    state.vel.set([vx, vy, vz], i * 3);
    state.age[i] = 0;
    state.life[i] = lifeS;
    state.size0[i] = size;
    state.heat0[i] = heat;
    state.spin[i] = (Math.random() - 0.5) * 0.6;
    state.data[i * 4 + 3] = Math.random() * Math.PI * 2;
  });

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    emit(dt, spawn.current);
    const k = Math.exp(-drag * dt);
    const { pos, vel, data, age, life, size0, heat0, spin } = state;
    for (let i = 0; i < max; i++) {
      const a = (age[i]! += dt);
      const l = life[i]!;
      if (a > l) {
        data[i * 4 + 1] = 0;
        continue;
      }
      const t = a / l;
      vel[i * 3]! *= k;
      vel[i * 3 + 1] = vel[i * 3 + 1]! * k + buoyancy * dt;
      vel[i * 3 + 2]! *= k;
      pos[i * 3]! += vel[i * 3]! * dt;
      pos[i * 3 + 1]! += vel[i * 3 + 1]! * dt;
      pos[i * 3 + 2]! += vel[i * 3 + 2]! * dt;
      data[i * 4] = size0[i]! * (1 + grow * a);
      data[i * 4 + 1] = Math.min(1, t * 8) * Math.pow(1 - t, 1.5);
      data[i * 4 + 2] = heat0[i]! * Math.max(0, 1 - a * 1.6);
      data[i * 4 + 3]! += spin[i]! * dt;
    }
    geo.getAttribute("iPos").needsUpdate = true;
    geo.getAttribute("iData").needsUpdate = true;
    if (fire) {
      (mat.uniforms.uFirePos!.value as THREE.Vector3).copy(fire.pos);
      mat.uniforms.uFire!.value = fire.strength.current;
    }
  });

  return <mesh geometry={geo} material={mat} frustumCulled={false} renderOrder={5} />;
}

/* ---------- Engine flame ---------- */

const flameVertex = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    vUv = uv;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vN = normalize(mat3(modelMatrix) * normal);
    vV = normalize(cameraPosition - wp.xyz);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;
const flameFragment = /* glsl */ `
  uniform float uTime;
  uniform float uPower;
  uniform vec3 uHot;
  uniform vec3 uMid;
  uniform vec3 uCool;
  uniform float uDiamonds;
  varying vec2 vUv;
  varying vec3 vN;
  varying vec3 vV;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
  }
  void main() {
    float y = 1.0 - vUv.y; // 0 at the nozzle, 1 at the tail
    float edge = pow(abs(dot(normalize(vN), normalize(vV))), 1.4);
    float n = noise(vec2(vUv.x * 12.0, y * 6.0 - uTime * 14.0)) * 0.6 + noise(vec2(vUv.x * 30.0, y * 18.0 - uTime * 30.0)) * 0.4;
    float body = smoothstep(1.0, 0.05, y + n * 0.35) * edge;
    float diamonds = 1.0 + uDiamonds * 0.6 * pow(max(0.0, sin(y * 34.0)), 6.0) * smoothstep(0.6, 0.0, y);
    vec3 col = mix(uHot, uMid, smoothstep(0.0, 0.35, y));
    col = mix(col, uCool, smoothstep(0.3, 0.9, y));
    float a = body * uPower * diamonds;
    gl_FragColor = vec4(col * a * 3.0, 1.0);
  }
`;

export interface FlameProps {
  length: number;
  radius: number;
  power: { current: number };
  /** Plume widening factor (1 at sea level, larger in thin air). */
  spread?: { current: number };
  hot?: THREE.ColorRepresentation;
  mid?: THREE.ColorRepresentation;
  cool?: THREE.ColorRepresentation;
  diamonds?: number;
}

/** Additive animated rocket plume pointing down (-y) from its origin (the nozzle exit). */
export function Flame({
  length,
  radius,
  power,
  spread,
  hot = "#fff6dd",
  mid = "#ffb347",
  cool = "#ff4a1c",
  diamonds = 1,
}: FlameProps) {
  const make = (scale: number) =>
    new THREE.ShaderMaterial({
      vertexShader: flameVertex,
      fragmentShader: flameFragment,
      uniforms: {
        uTime: { value: 0 },
        uPower: { value: 0 },
        uHot: { value: new THREE.Color(hot) },
        uMid: { value: new THREE.Color(mid) },
        uCool: { value: new THREE.Color(cool) },
        uDiamonds: { value: diamonds * scale },
      },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
  const [outer, inner] = useMemo(() => [make(0.4), make(1)], [hot, mid, cool, diamonds]);
  const group = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const p = power.current;
    const flick = 0.92 + 0.08 * Math.sin(t * 61) * Math.sin(t * 23);
    for (const m of [outer, inner]) {
      m.uniforms.uTime!.value = t;
      m.uniforms.uPower!.value = p * flick;
    }
    if (group.current) {
      const s = spread?.current ?? 1;
      group.current.scale.set(s, Math.max(0.05, p) * (0.95 + 0.05 * flick) * (0.8 + 0.2 * s), s);
      group.current.visible = p > 0.01;
    }
  });
  return (
    <group ref={group}>
      <mesh position={[0, -length / 2, 0]} material={outer} renderOrder={6}>
        <cylinderGeometry args={[radius * 1.35, radius * 0.5, length, 32, 24, true]} />
      </mesh>
      <mesh position={[0, -length * 0.3, 0]} material={inner} renderOrder={7}>
        <cylinderGeometry args={[radius * 0.55, radius * 0.95, length * 0.6, 24, 16, true]} />
      </mesh>
    </group>
  );
}

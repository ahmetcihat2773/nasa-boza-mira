import { useTexture } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";

const BASE = import.meta.env.BASE_URL;
export const EARTH_DAY_URL = `${BASE}textures/earth-day.jpg`;
export const EARTH_NIGHT_URL = `${BASE}textures/earth-night.jpg`;

const earthVertex = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vPosW;
  void main() {
    vUv = uv;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vPosW = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

// Day/night Earth: NASA day mosaic lit by the sun, city lights on the night side,
// a deep-blue ocean with sun glint (ocean found from the texture colour), warm twilight and blue limb haze.
const earthFragment = /* glsl */ `
  uniform sampler2D uDay;
  uniform sampler2D uNight;
  uniform vec3 uSunDir;
  uniform float uHaze;
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vPosW;

  void main() {
    vec3 n = normalize(vNormalW);
    vec3 v = normalize(cameraPosition - vPosW);
    vec3 day = texture2D(uDay, vUv).rgb;
    vec3 night = texture2D(uNight, vUv).rgb;
    float ndl = dot(n, uSunDir);

    float ocean = smoothstep(0.004, 0.022, day.b - 1.35 * max(day.r, day.g));
    vec3 oceanCol = mix(vec3(0.003, 0.016, 0.045), vec3(0.006, 0.04, 0.085), smoothstep(0.0, 0.6, ndl));
    day = mix(day * 1.15, oceanCol, ocean);

    float light = smoothstep(-0.08, 0.5, ndl);
    vec3 col = day * light * 1.75;

    // Warm band along the terminator.
    float twilight = exp(-pow(ndl * 6.0, 2.0));
    col += vec3(0.9, 0.35, 0.12) * twilight * 0.02;

    // Specular sun glint on the oceans.
    vec3 h = normalize(uSunDir + v);
    float nh = max(dot(n, h), 0.0);
    float spec = (pow(nh, 400.0) * 0.28 + pow(nh, 40.0) * 0.015) * ocean * smoothstep(0.0, 0.25, ndl);
    col += vec3(1.0, 0.86, 0.66) * spec;

    // City lights where it is dark.
    float dark = smoothstep(0.12, -0.18, ndl);
    float lum = dot(night, vec3(0.299, 0.587, 0.114));
    vec3 lights = night * smoothstep(0.06, 0.45, lum) * vec3(1.6, 1.15, 0.7) * 2.4;
    col += lights * dark;
    col += day * 0.012 * dark; // faint moonlight keeps the night side readable

    // Atmospheric haze toward the limb.
    float fres = pow(1.0 - max(dot(n, v), 0.0), 2.5);
    vec3 haze = vec3(0.32, 0.6, 1.0) * smoothstep(-0.05, 0.5, ndl) * 1.1;
    col = mix(col, haze, fres * uHaze * smoothstep(0.0, 0.4, ndl));

    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const atmosphereVertex = /* glsl */ `
  varying vec3 vPosW;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vPosW = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

// Glow from the closest approach of each view ray to Earth: works from far away and from low orbit.
const atmosphereFragment = /* glsl */ `
  uniform vec3 uCenter;
  uniform float uRadius;
  uniform vec3 uSunDir;
  uniform float uThickness;
  uniform float uIntensity;
  varying vec3 vPosW;
  void main() {
    vec3 rd = normalize(vPosW - cameraPosition);
    vec3 oc = uCenter - cameraPosition;
    float tca = max(dot(oc, rd), 0.0);
    vec3 closest = cameraPosition + rd * tca;
    float h = length(closest - uCenter) / uRadius;
    float glow = exp(-max(h - 1.0, 0.0) / uThickness);
    vec3 nrm = normalize(closest - uCenter);
    float sun = dot(nrm, uSunDir);
    float lit = smoothstep(-0.3, 0.35, sun);
    vec3 col = mix(vec3(1.0, 0.42, 0.18), vec3(0.3, 0.6, 1.0), smoothstep(-0.12, 0.35, sun));
    gl_FragColor = vec4(col * glow * lit * uIntensity, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export interface EarthProps {
  radius?: number;
  /** Direction to the sun in world space (normalised). */
  sunDir: THREE.Vector3;
  /** Atmosphere thickness as a fraction of the radius (larger = softer, wider glow). */
  atmosphere?: number;
  atmosphereIntensity?: number;
  segments?: number;
}

/** Textured Earth with atmosphere. Rotate the parent group to spin it (Greenwich on +x at rotation 0). */
export function Earth({ radius = 1, sunDir, atmosphere = 0.03, atmosphereIntensity = 1.4, segments = 96 }: EarthProps) {
  const [day, night] = useTexture([EARTH_DAY_URL, EARTH_NIGHT_URL]);
  useLayoutEffect(() => {
    for (const t of [day, night]) {
      if (!t) continue;
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 8;
      t.needsUpdate = true;
    }
  }, [day, night]);

  const earthMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: earthVertex,
        fragmentShader: earthFragment,
        uniforms: {
          uDay: { value: day },
          uNight: { value: night },
          uSunDir: { value: sunDir.clone() },
          uHaze: { value: 0.75 },
        },
      }),
    [day, night, sunDir],
  );

  const atmoMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: atmosphereVertex,
        fragmentShader: atmosphereFragment,
        uniforms: {
          uCenter: { value: new THREE.Vector3() },
          uRadius: { value: radius },
          uSunDir: { value: sunDir.clone() },
          uThickness: { value: atmosphere },
          uIntensity: { value: atmosphereIntensity },
        },
        side: THREE.BackSide,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    [radius, sunDir, atmosphere, atmosphereIntensity],
  );

  const shell = useRef<THREE.Mesh>(null);
  useFrame(() => {
    shell.current?.getWorldPosition(atmoMat.uniforms.uCenter!.value as THREE.Vector3);
  });

  return (
    <group>
      <mesh material={earthMat}>
        <sphereGeometry args={[radius, segments * 2, segments]} />
      </mesh>
      <mesh ref={shell} material={atmoMat} renderOrder={1}>
        <sphereGeometry args={[radius * (1 + atmosphere * 7), 96, 48]} />
      </mesh>
    </group>
  );
}

const sunVertex = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const sunFragment = /* glsl */ `
  uniform float uIntensity;
  varying vec2 vUv;
  void main() {
    float d = length(vUv - 0.5) * 2.0;
    float core = smoothstep(0.08, 0.0, d);
    float halo = exp(-d * 5.0) * 0.6 + exp(-d * 14.0);
    float rays = pow(max(0.0, 1.0 - abs(vUv.x - 0.5) * 60.0), 2.0) * exp(-d * 2.5) * 0.25
               + pow(max(0.0, 1.0 - abs(vUv.y - 0.5) * 60.0), 2.0) * exp(-d * 2.5) * 0.25;
    vec3 col = vec3(1.0, 0.93, 0.82) * (core * 6.0 + halo * 1.4 + rays) * uIntensity;
    gl_FragColor = vec4(col, 1.0);
  }
`;

/** A bright billboard sun far away in the given direction (blooms with postprocessing). */
export function SunGlow({
  dir,
  distance = 60,
  size = 14,
  intensity = 1,
}: {
  dir: THREE.Vector3;
  distance?: number;
  size?: number;
  intensity?: number;
}) {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: sunVertex,
        fragmentShader: sunFragment,
        uniforms: { uIntensity: { value: intensity } },
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    [intensity],
  );
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ camera }) => {
    if (!ref.current) return;
    ref.current.position.copy(camera.position).addScaledVector(dir, distance);
    ref.current.quaternion.copy(camera.quaternion);
  });
  return (
    <mesh ref={ref} material={mat} renderOrder={-1} frustumCulled={false}>
      <planeGeometry args={[size, size]} />
    </mesh>
  );
}

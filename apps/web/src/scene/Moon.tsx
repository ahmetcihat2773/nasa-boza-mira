import { useTexture } from "@react-three/drei";
import { useLayoutEffect, useMemo } from "react";
import * as THREE from "three";

const BASE = import.meta.env.BASE_URL;
export const MOON_URL = `${BASE}textures/moon.jpg`;

const moonVertex = /* glsl */ `
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

// Airless Moon: hard terminator, a faint earthshine on the night side, the LROC colour mosaic
// with a touch of extra contrast so maria and highlands read from orbit. No atmosphere, no limb haze.
const moonFragment = /* glsl */ `
  uniform sampler2D uMap;
  uniform vec3 uSunDir;
  uniform vec3 uEarthDir;
  uniform float uEarthshine;
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vPosW;

  void main() {
    vec3 n = normalize(vNormalW);
    vec3 v = normalize(cameraPosition - vPosW);
    vec3 alb = texture2D(uMap, vUv).rgb;
    alb = pow(alb, vec3(1.15)) * 1.1;
    float ndl = dot(n, uSunDir);
    // Lunar regolith is strongly back-scattering: brighter when the sun is behind the viewer.
    float opposition = 1.0 + 0.35 * pow(max(dot(v, uSunDir), 0.0), 8.0);
    float light = smoothstep(-0.02, 0.18, ndl) * (0.55 + 0.45 * max(ndl, 0.0)) * opposition;
    vec3 col = alb * light * 1.9 * vec3(1.0, 0.98, 0.95);
    // Earthshine: a faint blue-grey lift on the side that faces Earth.
    float es = max(dot(n, uEarthDir), 0.0) * (1.0 - smoothstep(-0.05, 0.1, ndl));
    col += alb * vec3(0.5, 0.65, 0.9) * es * uEarthshine;
    col += alb * 0.006; // keep the far night side from vanishing completely
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export interface MoonProps {
  radius?: number;
  /** Direction to the sun in world space (normalised). */
  sunDir: THREE.Vector3;
  /** Direction to Earth in world space, for earthshine (normalised). */
  earthDir?: THREE.Vector3;
  earthshine?: number;
  segments?: number;
}

/** Textured Moon (LROC colour mosaic). Rotate the parent group to spin it (0° longitude on +x at rotation 0). */
export function Moon({ radius = 1, sunDir, earthDir, earthshine = 0.08, segments = 96 }: MoonProps) {
  const map = useTexture(MOON_URL);
  useLayoutEffect(() => {
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 8;
    map.needsUpdate = true;
  }, [map]);
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: moonVertex,
        fragmentShader: moonFragment,
        uniforms: {
          uMap: { value: map },
          uSunDir: { value: sunDir.clone() },
          uEarthDir: { value: (earthDir ?? new THREE.Vector3(1, 0, 0)).clone() },
          uEarthshine: { value: earthshine },
        },
      }),
    [map, sunDir, earthDir, earthshine],
  );
  return (
    <mesh material={mat}>
      <sphereGeometry args={[radius, segments * 2, segments]} />
    </mesh>
  );
}

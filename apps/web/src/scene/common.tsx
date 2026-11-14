import { Environment, Lightformer } from "@react-three/drei";
import { EARTH_RADIUS_KM, type Vec3 } from "@space-mission/sim";
import { useEffect, useState } from "react";
import * as THREE from "three";

/** Inertial frame (z = north, km) to scene units (y up, 1 unit = Earth radius). Matches Earth's texture mapping. */
export function toScene(v: Vec3, out = new THREE.Vector3(), unitKm = EARTH_RADIUS_KM): THREE.Vector3 {
  return out.set(v.x / unitKm, v.z / unitKm, -v.y / unitKm);
}

/** Tracks the user's `prefers-reduced-motion` setting. */
export function useReducedMotion(): boolean {
  const query = "(prefers-reduced-motion: reduce)";
  const [reduced, setReduced] = useState(() => typeof window !== "undefined" && window.matchMedia(query).matches);
  useEffect(() => {
    const m = window.matchMedia(query);
    const on = () => setReduced(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return reduced;
}

/** Offline studio reflections (no HDR download): a key strip, a cool fill and a warm rim. */
export function SpaceReflections() {
  return (
    <Environment resolution={128} frames={1}>
      <Lightformer form="rect" intensity={4} position={[5, 5, 5]} scale={[10, 4, 1]} color="#fff4e0" />
      <Lightformer form="rect" intensity={1.2} position={[-6, 2, -3]} scale={[8, 8, 1]} color="#6fa8ff" />
      <Lightformer form="ring" intensity={2} position={[0, -6, 3]} scale={4} color="#ffb070" />
    </Environment>
  );
}

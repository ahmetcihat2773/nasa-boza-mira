import { OrbitControls } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo, useRef, type ReactNode } from "react";
import type * as THREE from "three";
import { useGame } from "../store.ts";
import { SpaceReflections, useReducedMotion } from "./common.tsx";
import { Satellite } from "./Satellite.tsx";
import { spacecraftLook } from "./spacecraftLook.ts";
import "./scene.css";

const SIZE_LABEL = { "6U": "6U CubeSat", "12U": "12U CubeSat", smallsat: "Small satellite" } as const;

function Turntable({ children, reduced }: { children: ReactNode; reduced: boolean }) {
  const ref = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (ref.current && !reduced) ref.current.rotation.y += dt * 0.35;
  });
  return <group ref={ref}>{children}</group>;
}

/** Small rotating 3D preview of the spacecraft as currently designed (Spacecraft tab). */
export default function SpacecraftPreview() {
  const design = useGame((s) => s.design);
  const reduced = useReducedMotion();
  const look = useMemo(() => spacecraftLook(design), [design]);
  // Fit the model: span of the body plus deployed wings, in decimetres.
  const wingSpan = look.solar === "rollout" ? 3 : look.solar === "wings" ? 2 : 0;
  const span = Math.max(look.body[2], look.body[0] + 2 * wingSpan * Math.max(look.body[1], look.body[0] * 0.9));
  const scale = 4 / span;

  return (
    <div className="sc-preview">
      <Canvas dpr={[1, 2]} camera={{ position: [3.2, 2.2, 3.6], fov: 35 }} gl={{ antialias: true }}>
        <color attach="background" args={["#05080e"]} />
        <ambientLight intensity={0.25} />
        <directionalLight position={[4, 6, 3]} intensity={2.6} color="#fff3e2" />
        <directionalLight position={[-4, -2, -3]} intensity={0.6} color="#6fa8ff" />
        <SpaceReflections />
        <Turntable reduced={reduced}>
          <group rotation={[0.25, 0, 0]}>
            <Satellite look={look} scale={scale} />
          </group>
        </Turntable>
        <OrbitControls enablePan={false} enableZoom={false} />
      </Canvas>
      <div className="sc-label">
        {SIZE_LABEL[look.size]}
        {design.parts.structure ? "" : " (choose a structure)"}
      </div>
    </div>
  );
}

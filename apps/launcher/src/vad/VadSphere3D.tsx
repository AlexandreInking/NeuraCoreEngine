import { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Text } from '@react-three/drei';
import type { Group, Mesh } from 'three';
import type { VadState } from './types';

export type VadColorFn = (vad: VadState) => string;

const AXIS_LENGTH = 1.3;

function Axes() {
  const axis = (color: string, from: [number, number, number], to: [number, number, number], label: string, labelPos: [number, number, number]) => (
    <group key={label}>
      <line>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[new Float32Array([...from, ...to]), 3]}
          />
        </bufferGeometry>
        <lineBasicMaterial color={color} />
      </line>
      <Text position={labelPos} fontSize={0.14} color={color}>
        {label}
      </Text>
    </group>
  );
  return (
    <group>
      {axis('#ef4444', [-AXIS_LENGTH, 0, 0], [AXIS_LENGTH, 0, 0], 'V', [AXIS_LENGTH + 0.15, 0, 0])}
      {axis('#22c55e', [0, -AXIS_LENGTH, 0], [0, AXIS_LENGTH, 0], 'A', [0, AXIS_LENGTH + 0.15, 0])}
      {axis('#3b82f6', [0, 0, -AXIS_LENGTH], [0, 0, AXIS_LENGTH], 'D', [0, 0, AXIS_LENGTH + 0.15])}
    </group>
  );
}

function VadSphere({
  vad,
  color,
  intensity,
}: {
  vad: VadState;
  color: string;
  intensity: number;
}) {
  const sphereRef = useRef<Mesh>(null);
  useFrame(({ clock }) => {
    if (!sphereRef.current) return;
    const pulse = 1 + 0.08 * Math.sin(clock.getElapsedTime() * (4 + vad.arousal * 8));
    sphereRef.current.scale.setScalar(Math.max(0.25, intensity) * pulse);
  });
  return (
    <mesh
      ref={sphereRef}
      position={[vad.valence * 1.2, vad.arousal * 1.2, vad.dominance * 1.2]}
    >
      <sphereGeometry args={[0.28, 32, 32]} />
      <meshStandardMaterial color={color} roughness={0.35} emissive={color} emissiveIntensity={0.25} />
    </mesh>
  );
}

/**
 * 3D VAD viewer (hito 6.2): sphere at (V,A,D) in [-1,1]³, color from the
 * emotional quadrant, radius = emotional intensity, pulse frequency = arousal.
 */
export function VadSphere3D({
  vad,
  color,
  intensity,
}: {
  vad: VadState;
  color: string;
  intensity: number;
}) {
  const groupRef = useRef<Group>(null);
  return (
    <div className="vad-canvas">
      <Canvas camera={{ position: [2.6, 2.2, 3.2], fov: 45 }}>
        <ambientLight intensity={0.7} />
        <directionalLight position={[4, 6, 4]} intensity={1.2} />
        <group ref={groupRef}>
          <Axes />
          <VadSphere vad={vad} color={color} intensity={intensity} />
        </group>
        <OrbitControls enablePan={false} />
      </Canvas>
    </div>
  );
}

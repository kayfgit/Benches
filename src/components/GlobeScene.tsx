'use client';

import { Suspense, useRef, useEffect } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { Earth } from './Earth';
import { BenchMarkers } from './BenchMarkers';
import { useAppState } from '@/lib/store';

function Stars() {
  const ref = useRef<THREE.Points>(null);
  const [positions, sizes] = (() => {
    const count = 3000;
    const pos = new Float32Array(count * 3);
    const sz = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const r = 15 + Math.random() * 35;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      pos[i * 3 + 2] = r * Math.cos(phi);
      sz[i] = 0.5 + Math.random() * 1.5;
    }
    return [pos, sz];
  })();

  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.y += dt * 0.003;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-size" args={[sizes, 1]} />
      </bufferGeometry>
      <pointsMaterial
        size={0.06}
        color="#c4b89a"
        sizeAttenuation
        transparent
        opacity={0.7}
        depthWrite={false}
      />
    </points>
  );
}

function CameraController() {
  const { camera } = useThree();
  const { morphFactor, flyTo, setFlyTo } = useAppState();
  const targetPos = useRef(new THREE.Vector3(0, 0.3, 2.8));
  const flyToRef = useRef<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (flyTo) {
      flyToRef.current = flyTo;
      setFlyTo(null);
    }
  }, [flyTo, setFlyTo]);

  useFrame(() => {
    if (morphFactor > 0.5) {
      targetPos.current.set(0, 0, 3.5);
      camera.position.lerp(targetPos.current, 0.03);
    }

    if (flyToRef.current && morphFactor < 0.1) {
      const { lat, lng } = flyToRef.current;
      const phi = (90 - lat) * (Math.PI / 180);
      const theta = (lng + 180) * (Math.PI / 180);
      const r = camera.position.length();
      const tx = -(r * Math.sin(phi) * Math.cos(theta));
      const ty = r * Math.cos(phi);
      const tz = r * Math.sin(phi) * Math.sin(theta);
      const target = new THREE.Vector3(tx, ty, tz);
      camera.position.lerp(target, 0.04);
      if (camera.position.distanceTo(target) < 0.05) {
        flyToRef.current = null;
      }
    }
  });

  return null;
}

function SceneContent() {
  const { morphFactor, benches, pickingLocation } = useAppState();
  const groupRef = useRef<THREE.Group>(null);

  useFrame(() => {
    if (groupRef.current) {
      const targetRotY = -Math.PI / 2 * (1 - morphFactor);
      groupRef.current.rotation.y += (targetRotY - groupRef.current.rotation.y) * 0.08;
    }
  });

  return (
    <>
      <ambientLight intensity={0.15} />
      <directionalLight position={[5, 3, 5]} intensity={0.8} color="#ffeedd" />
      <Stars />
      <group ref={groupRef}>
        <Earth />
        <BenchMarkers benches={benches} morphFactor={morphFactor} pickingLocation={pickingLocation} />
      </group>
      <CameraController />
      <OrbitControls
        enablePan={morphFactor > 0.5}
        enableRotate={morphFactor < 0.5}
        enableZoom
        minDistance={1.5}
        maxDistance={8}
        zoomSpeed={0.5}
        rotateSpeed={0.4}
        enableDamping
        dampingFactor={0.08}
      />
    </>
  );
}

function LoadingFallback() {
  return (
    <mesh>
      <sphereGeometry args={[1, 32, 32]} />
      <meshBasicMaterial color="#0f1724" wireframe />
    </mesh>
  );
}

export default function GlobeScene() {
  const { pickingLocation } = useAppState();

  return (
    <div className={`absolute inset-0 ${pickingLocation ? 'cursor-crosshair' : ''}`}>
      <Canvas
        camera={{ position: [0, 0.3, 2.8], fov: 50, near: 0.1, far: 100 }}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        style={{ background: 'radial-gradient(ellipse at center, #0c1220 0%, #070b14 70%)' }}
      >
        <Suspense fallback={<LoadingFallback />}>
          <SceneContent />
        </Suspense>
      </Canvas>
    </div>
  );
}

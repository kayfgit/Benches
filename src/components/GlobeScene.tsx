'use client';

import { Suspense, useRef, useEffect } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { Earth } from './Earth';
import { CountryBorders } from './CountryBorders';
import { BenchMarkers } from './BenchMarkers';
import { useAppState } from '@/lib/store';

/* Warm floating dust motes instead of cold stars */
function DustMotes() {
  const ref = useRef<THREE.Points>(null);
  const positions = (() => {
    const count = 400;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r = 3 + Math.random() * 12;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      pos[i * 3 + 2] = r * Math.cos(phi);
    }
    return pos;
  })();

  useFrame((state) => {
    if (ref.current) {
      ref.current.rotation.y = state.clock.elapsedTime * 0.008;
      ref.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.005) * 0.05;
    }
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={0.012}
        color="#d4a06a"
        sizeAttenuation
        transparent
        opacity={0.35}
        depthWrite={false}
      />
    </points>
  );
}

/*
  Camera controller that works WITH OrbitControls.
  On morph toggle it disables controls briefly, snaps the camera
  to face the flat map head-on, then re-enables controls.
*/
function CameraController({ controlsRef }: { controlsRef: React.RefObject<any> }) {
  const { camera } = useThree();
  const { morphFactor, flyTo, setFlyTo } = useAppState();
  const flyToRef = useRef<{ lat: number; lng: number } | null>(null);
  const prevMorph = useRef(morphFactor);
  const animating = useRef(false);
  const flatTarget = useRef(new THREE.Vector3(0, 0, 3.2));

  useEffect(() => {
    if (flyTo) {
      flyToRef.current = flyTo;
      setFlyTo(null);
    }
  }, [flyTo, setFlyTo]);

  useFrame(() => {
    const controls = controlsRef.current;

    // Detect morph toggle
    if (Math.abs(morphFactor - prevMorph.current) > 0.5) {
      animating.current = true;
      if (controls) controls.enabled = false;
    }
    prevMorph.current = morphFactor;

    // Animate camera during morph transition
    if (animating.current) {
      if (morphFactor > 0.5) {
        camera.position.lerp(flatTarget.current, 0.12);
        camera.up.set(0, 1, 0);
        if (controls) controls.target.lerp(new THREE.Vector3(0, 0, 0), 0.12);
        if (camera.position.distanceTo(flatTarget.current) < 0.08) {
          animating.current = false;
          if (controls) {
            controls.enabled = true;
            controls.update();
          }
        }
      } else {
        // Going back to globe — just re-enable and let user orbit
        animating.current = false;
        if (controls) {
          controls.enabled = true;
          controls.update();
        }
      }
    }

    // Fly-to for "Near Me"
    if (flyToRef.current && morphFactor < 0.1 && !animating.current) {
      const { lat, lng } = flyToRef.current;
      const phi = (90 - lat) * (Math.PI / 180);
      const theta = (lng + 180) * (Math.PI / 180);
      const r = camera.position.length();
      const target = new THREE.Vector3(
        -(r * Math.sin(phi) * Math.cos(theta)),
        r * Math.cos(phi),
        r * Math.sin(phi) * Math.sin(theta)
      );
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
  const controlsRef = useRef<any>(null);

  useFrame(() => {
    if (groupRef.current) {
      const targetRotY = -Math.PI / 2 * (1 - morphFactor);
      groupRef.current.rotation.y += (targetRotY - groupRef.current.rotation.y) * 0.12;
    }
  });

  return (
    <>
      {/* Warm, soft lighting like morning sun */}
      <ambientLight intensity={0.35} color="#ffe8d0" />
      <directionalLight position={[5, 4, 3]} intensity={0.6} color="#ffd9b3" />
      <directionalLight position={[-3, 2, -2]} intensity={0.15} color="#d4c4a8" />

      <DustMotes />

      <group ref={groupRef}>
        <Earth />
        <CountryBorders />
        <BenchMarkers benches={benches} morphFactor={morphFactor} pickingLocation={pickingLocation} />
      </group>

      <CameraController controlsRef={controlsRef} />
      <OrbitControls
        ref={controlsRef}
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
      <meshBasicMaterial color="#2e2720" wireframe />
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
        style={{
          background: 'radial-gradient(ellipse at 50% 45%, #2e261e 0%, #1f1a13 40%, #17130e 80%)',
        }}
      >
        <Suspense fallback={<LoadingFallback />}>
          <SceneContent />
        </Suspense>
      </Canvas>
    </div>
  );
}

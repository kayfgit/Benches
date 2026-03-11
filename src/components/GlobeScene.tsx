'use client';

import { Suspense, useRef, useEffect, useCallback } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { Earth } from './Earth';
import { CountryBorders } from './CountryBorders';
import { DetailLayer } from './DetailLayer';
import { BenchMarkers } from './BenchMarkers';
import { useAppState } from '@/lib/store';

/* Warm floating dust motes */
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

/* Custom zoom controller with Ctrl/Shift modifiers + adaptive rotation speed */
function ZoomController({ controlsRef }: { controlsRef: React.RefObject<any> }) {
  const { camera, gl } = useThree();
  const zoomSpeed = useRef(1);

  // Adjust rotation speed based on zoom level (slower when close)
  useFrame(() => {
    const controls = controlsRef.current;
    if (!controls) return;

    const dist = camera.position.length();
    // At dist=1.08 (closest), speed ~0.05; at dist=3, speed ~0.4; at dist=50, speed ~0.8
    const rotateSpeed = Math.min(0.8, Math.max(0.05, (dist - 1) * 0.2));
    controls.rotateSpeed = rotateSpeed;
  });

  useEffect(() => {
    const canvas = gl.domElement;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Control') zoomSpeed.current = 3; // Faster
      if (e.key === 'Shift') zoomSpeed.current = 0.3; // Slower
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Control' || e.key === 'Shift') {
        zoomSpeed.current = 1;
      }
    };

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();

      const controls = controlsRef.current;
      if (!controls || !controls.enabled) return;

      // Calculate zoom factor based on current distance and wheel delta
      const currentDist = camera.position.length();
      const delta = e.deltaY * 0.001 * zoomSpeed.current;

      // Use exponential zoom for smooth feel at all distances
      const zoomFactor = Math.exp(delta);
      const newDist = Math.max(1.08, Math.min(50, currentDist * zoomFactor));

      // Scale camera position to new distance
      camera.position.normalize().multiplyScalar(newDist);
      controls.update();
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    canvas.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      canvas.removeEventListener('wheel', handleWheel);
    };
  }, [camera, gl, controlsRef]);

  return null;
}

/* Camera controller for fly-to */
function CameraController({ controlsRef }: { controlsRef: React.RefObject<any> }) {
  const { camera } = useThree();
  const { flyTo, setFlyTo } = useAppState();
  const flyToRef = useRef<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (flyTo) {
      flyToRef.current = flyTo;
      setFlyTo(null);
    }
  }, [flyTo, setFlyTo]);

  useFrame(() => {
    if (flyToRef.current) {
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
  const { benches, pickingLocation } = useAppState();
  const controlsRef = useRef<any>(null);

  return (
    <>
      {/* Warm, soft lighting */}
      <ambientLight intensity={0.35} color="#ffe8d0" />
      <directionalLight position={[5, 4, 3]} intensity={0.6} color="#ffd9b3" />
      <directionalLight position={[-3, 2, -2]} intensity={0.15} color="#d4c4a8" />

      <DustMotes />

      <group>
        <Earth />
        <CountryBorders />
        <DetailLayer />
        <BenchMarkers benches={benches} pickingLocation={pickingLocation} />
      </group>

      <ZoomController controlsRef={controlsRef} />
      <CameraController controlsRef={controlsRef} />
      <OrbitControls
        ref={controlsRef}
        enablePan={false}
        enableZoom={false} // We handle zoom ourselves
        enableRotate
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
        camera={{ position: [0, 0.3, 2.8], fov: 50, near: 0.01, far: 100 }}
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

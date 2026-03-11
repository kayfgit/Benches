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

/* Custom zoom controller with cursor-targeting, smoothing, and Ctrl/Shift modifiers */
function ZoomController({ controlsRef }: { controlsRef: React.RefObject<any> }) {
  const { camera, gl } = useThree();
  const zoomSpeedMod = useRef(1);

  // Smooth zoom state
  const targetCameraPos = useRef(new THREE.Vector3());
  const isAnimating = useRef(false);
  const raycaster = useRef(new THREE.Raycaster());
  const globeSphere = useRef(new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1));

  // Initialize target position
  useEffect(() => {
    targetCameraPos.current.copy(camera.position);
  }, [camera]);

  // Stop animation when user starts dragging
  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;

    const handleStart = () => {
      // User started dragging - stop zoom animation immediately
      isAnimating.current = false;
      targetCameraPos.current.copy(camera.position);
    };

    controls.addEventListener('start', handleStart);
    return () => controls.removeEventListener('start', handleStart);
  }, [controlsRef, camera]);

  // Smooth animation + adaptive rotation speed
  useFrame(() => {
    const controls = controlsRef.current;
    if (!controls) return;

    // Keep controls target at origin always (globe center)
    controls.target.set(0, 0, 0);

    // Animate camera position smoothly
    if (isAnimating.current) {
      camera.position.lerp(targetCameraPos.current, 0.15);

      // Stop animating when close enough
      if (camera.position.distanceTo(targetCameraPos.current) < 0.0001) {
        camera.position.copy(targetCameraPos.current);
        isAnimating.current = false;
      }
      controls.update();
    }

    // Adaptive rotation speed based on zoom level
    const dist = camera.position.length();
    const rotateSpeed = Math.min(0.8, Math.max(0.02, (dist - 1) * 0.25));
    controls.rotateSpeed = rotateSpeed;
  });

  useEffect(() => {
    const canvas = gl.domElement;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Control') zoomSpeedMod.current = 3;
      if (e.key === 'Shift') zoomSpeedMod.current = 0.3;
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Control' || e.key === 'Shift') {
        zoomSpeedMod.current = 1;
      }
    };

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();

      const controls = controlsRef.current;
      if (!controls || !controls.enabled) return;

      const currentDist = camera.position.length();

      // Zoom speed inversely proportional to distance (slower when closer)
      const distanceFactor = Math.max(0.1, (currentDist - 1) * 0.5);
      const delta = e.deltaY * 0.002 * zoomSpeedMod.current * distanceFactor;
      const zoomFactor = Math.exp(delta);

      // Min distance 1.002, max 50
      const newDist = Math.max(1.002, Math.min(50, currentDist * zoomFactor));
      const zoomingIn = newDist < currentDist;

      // Get mouse position in normalized device coordinates (-1 to +1)
      const rect = canvas.getBoundingClientRect();
      const mouseX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const mouseY = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      // Raycast from cursor to find point on globe
      raycaster.current.setFromCamera(new THREE.Vector2(mouseX, mouseY), camera);
      const intersectPoint = new THREE.Vector3();
      const hit = raycaster.current.ray.intersectSphere(globeSphere.current, intersectPoint);

      if (hit && zoomingIn && currentDist < 8) {
        // Zoom towards cursor: rotate camera around origin towards cursor point
        const currentDir = camera.position.clone().normalize();
        const cursorDir = intersectPoint.clone().normalize();

        // Interpolate direction towards cursor
        const lerpAmount = Math.min(0.4, (1 - newDist / currentDist) * 2.5);
        const newDir = currentDir.clone().lerp(cursorDir, lerpAmount).normalize();

        targetCameraPos.current.copy(newDir.multiplyScalar(newDist));
      } else {
        // Zooming out or no hit - just scale distance
        targetCameraPos.current.copy(camera.position).normalize().multiplyScalar(newDist);
      }

      isAnimating.current = true;
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
        camera={{ position: [0, 0.3, 2.8], fov: 50, near: 0.001, far: 100 }}
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

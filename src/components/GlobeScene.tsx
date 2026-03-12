'use client';

import { Suspense, useRef, useEffect } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { Earth } from './Earth';
import { CountryBorders } from './CountryBorders';
import { DetailLayer } from './DetailLayer';
import { StreetTiles } from './StreetTiles';
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

      // Zoom speed inversely proportional to distance (much slower when very close)
      const heightAboveSurface = currentDist - 1;
      const distanceFactor = Math.max(0.05, Math.min(1, heightAboveSurface * 2));
      const delta = e.deltaY * 0.0015 * zoomSpeedMod.current * distanceFactor;
      const zoomFactor = Math.exp(delta);

      // Min distance 1.002 (0.2% above surface for street-level view), max 50
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

      if (hit && currentDist < 8) {
        const currentDir = camera.position.clone().normalize();
        const cursorDir = intersectPoint.clone().normalize();

        if (zoomingIn) {
          // Zoom in: rotate camera towards cursor point
          const lerpAmount = Math.min(0.4, (1 - newDist / currentDist) * 2.5);
          const newDir = currentDir.clone().lerp(cursorDir, lerpAmount).normalize();
          targetCameraPos.current.copy(newDir.multiplyScalar(newDist));
        } else {
          // Zoom out: rotate camera away from cursor point (reverse direction)
          const lerpAmount = Math.min(0.3, (newDist / currentDist - 1) * 2);
          // Lerp in opposite direction: away from cursor
          const awayDir = currentDir.clone().lerp(cursorDir, -lerpAmount).normalize();
          targetCameraPos.current.copy(awayDir.multiplyScalar(newDist));
        }
      } else {
        // No hit or too far - just scale distance
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

/* Camera controller for fly-to + zoom level tracking */
function CameraController({ controlsRef }: { controlsRef: React.RefObject<any> }) {
  const { camera } = useThree();
  const { flyTo, setFlyTo, setZoomLevel } = useAppState();
  const flyToRef = useRef<{ lat: number; lng: number; phase: 'rotate' | 'zoom'; targetDir: THREE.Vector3 } | null>(null);
  const lastZoomUpdate = useRef(0);
  const targetDistance = 1.15; // How close to zoom in when flying to location

  useEffect(() => {
    if (flyTo) {
      // Pre-calculate target direction
      const phi = (90 - flyTo.lat) * (Math.PI / 180);
      const theta = (flyTo.lng + 180) * (Math.PI / 180);
      const targetDir = new THREE.Vector3(
        -(Math.sin(phi) * Math.cos(theta)),
        Math.cos(phi),
        Math.sin(phi) * Math.sin(theta)
      ).normalize();

      flyToRef.current = { ...flyTo, phase: 'rotate', targetDir };
      setFlyTo(null);
    }
  }, [flyTo, setFlyTo]);

  useFrame(() => {
    // Update zoom level in store (throttled to avoid excessive re-renders)
    const currentDist = camera.position.length();
    const now = Date.now();
    if (now - lastZoomUpdate.current > 100) {
      lastZoomUpdate.current = now;
      setZoomLevel(currentDist);
    }

    // Handle fly-to animation
    if (flyToRef.current) {
      const { phase, targetDir } = flyToRef.current;
      const currentDist = camera.position.length();

      if (phase === 'rotate') {
        // Phase 1: Rotate to face the target location
        const currentDir = camera.position.clone().normalize();

        // Check alignment BEFORE lerping
        const alignment = currentDir.dot(targetDir);

        // Lerp direction towards target (clone to avoid mutation)
        const newDir = currentDir.clone().lerp(targetDir, 0.05).normalize();
        camera.position.copy(newDir.multiplyScalar(currentDist));

        // Move to zoom phase when facing target
        if (alignment > 0.99) {
          flyToRef.current.phase = 'zoom';
        }
      } else {
        // Phase 2: Zoom in to the target while maintaining direction
        const currentDir = camera.position.clone().normalize();

        // Keep rotating slightly towards target while zooming
        const newDir = currentDir.clone().lerp(flyToRef.current.targetDir, 0.03).normalize();
        const newDist = currentDist + (targetDistance - currentDist) * 0.05;

        camera.position.copy(newDir.multiplyScalar(newDist));

        // Done when close enough to target distance
        if (Math.abs(currentDist - targetDistance) < 0.03) {
          flyToRef.current = null;
        }
      }

      if (controlsRef.current) {
        controlsRef.current.update();
      }
    }
  });

  return null;
}

/* Auto-rotation that stops on user interaction, can be resumed */
function AutoRotation({ controlsRef }: { controlsRef: React.RefObject<any> }) {
  const { camera } = useThree();
  const { shouldResumeRotation, setShouldResumeRotation } = useAppState();
  const isRotating = useRef(true);
  const rotationSpeed = 0.0003; // Very slow rotation

  // Resume rotation when triggered
  useEffect(() => {
    if (shouldResumeRotation) {
      isRotating.current = true;
      setShouldResumeRotation(false);
    }
  }, [shouldResumeRotation, setShouldResumeRotation]);

  // Stop rotation on any user interaction
  useEffect(() => {
    const stopRotation = () => {
      isRotating.current = false;
    };

    window.addEventListener('mousedown', stopRotation);
    window.addEventListener('wheel', stopRotation);
    window.addEventListener('touchstart', stopRotation);
    window.addEventListener('keydown', stopRotation);

    return () => {
      window.removeEventListener('mousedown', stopRotation);
      window.removeEventListener('wheel', stopRotation);
      window.removeEventListener('touchstart', stopRotation);
      window.removeEventListener('keydown', stopRotation);
    };
  }, []);

  useFrame(() => {
    if (!isRotating.current) return;

    // Rotate camera around Y axis (globe's up axis)
    const currentAngle = Math.atan2(camera.position.x, camera.position.z);
    const newAngle = currentAngle + rotationSpeed;

    // Maintain current height (Y) while rotating around
    const horizontalDist = Math.sqrt(
      camera.position.x * camera.position.x + camera.position.z * camera.position.z
    );

    camera.position.x = Math.sin(newAngle) * horizontalDist;
    camera.position.z = Math.cos(newAngle) * horizontalDist;

    if (controlsRef.current) {
      controlsRef.current.update();
    }
  });

  return null;
}

function SceneContent() {
  const { pickingLocation } = useAppState();
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
        <StreetTiles />
        <BenchMarkers pickingLocation={pickingLocation} />
      </group>

      <AutoRotation controlsRef={controlsRef} />
      <ZoomController controlsRef={controlsRef} />
      <CameraController controlsRef={controlsRef} />
      <OrbitControls
        ref={controlsRef}
        enablePan={false}
        enableZoom={false} // We handle zoom ourselves
        enableRotate
        enableDamping
        dampingFactor={0.08}
        mouseButtons={{
          LEFT: THREE.MOUSE.ROTATE,
          MIDDLE: THREE.MOUSE.ROTATE,
          RIGHT: THREE.MOUSE.ROTATE,
        }}
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

'use client';

import { Suspense, useRef, useEffect, useMemo } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// Reusable temp vectors to avoid allocations in useFrame loops
const _tempVec3_1 = new THREE.Vector3();
const _tempVec3_2 = new THREE.Vector3();
const _tempQuat = new THREE.Quaternion();
import { Earth } from './Earth';
import { CountryBorders } from './CountryBorders';
import { DetailLayer } from './DetailLayer';
import { StreetTiles } from './StreetTiles';
import { BenchMarkers } from './BenchMarkers';
import { useAppState } from '@/lib/store';

// Dust mote count
const DUST_COUNT = 300;

/* Warm floating dust motes */
function DustMotes({ count }: { count: number }) {
  const ref = useRef<THREE.Points>(null);
  // Memoize positions - recreate when count changes (performance mode toggle)
  const positions = useMemo(() => {
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
  }, [count]);

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
 * Custom globe controller with:
 * - "Grab and drag" - point under cursor stays under cursor (like Google Maps)
 * - Zoom to cursor position
 * - Momentum/inertia on both drag and zoom
 * - Smooth animations
 */
function GlobeController() {
  const { camera, gl } = useThree();

  // Refs for state
  const raycaster = useRef(new THREE.Raycaster());
  const globeSphere = useRef(new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1));

  // Drag state
  const isDragging = useRef(false);
  const grabPoint = useRef(new THREE.Vector3()); // Point on globe where user grabbed
  const lastMouse = useRef({ x: 0, y: 0 });

  // Momentum state
  const velocity = useRef(new THREE.Vector3()); // Angular velocity for drag momentum
  const lastDragTime = useRef(0);
  const dragDelta = useRef(new THREE.Quaternion());

  // Zoom state
  const targetDistance = useRef(camera.position.length());
  const zoomSpeedMod = useRef(1);

  // Constants
  const DRAG_DAMPING = 0.92; // How quickly drag momentum decays (higher = more momentum)
  const ZOOM_SMOOTHING = 0.4; // How smoothly camera approaches target distance (higher = snappier)
  const MIN_VELOCITY = 0.0001; // Stop momentum below this threshold
  const MAX_POLAR_ANGLE = 0.5; // How close to poles camera can get (in radians from pole, ~28 degrees)

  // ===========================================
  // ZOOM LIMITS - Adjust these values as needed
  // ===========================================
  const MIN_CAMERA_DIST = 1.0001;  // Target zoom limit (what scroll stops at)
  const HARD_FLOOR = 1.0001;       // Absolute minimum (never go below this)
  const MAX_CAMERA_DIST = 50;      // How far out
  // Altitude-based log zoom: fraction of log(altitude) range per scroll
  // 0.03 = ~33 scroll steps from street level to full globe view
  const ZOOM_SPEED = 0.03;

  // Target direction for zoom-to-cursor (initialized in useEffect)
  const targetDirection = useRef(new THREE.Vector3(0, 0, 1));

  // Initialize target direction from actual camera position
  useEffect(() => {
    targetDirection.current.copy(camera.position).normalize();
    targetDistance.current = camera.position.length();
  }, [camera]);

  // Get normalized mouse coordinates
  const getMouseCoords = (e: MouseEvent | Touch) => {
    const rect = gl.domElement.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * 2 - 1,
      y: -((e.clientY - rect.top) / rect.height) * 2 + 1,
    };
  };

  // Clamp camera position to prevent going over poles (like Google Maps)
  const clampToPolarLimit = () => {
    const pos = camera.position;
    const dist = pos.length();
    const horizontalDist = Math.sqrt(pos.x * pos.x + pos.z * pos.z);

    // Calculate current polar angle (angle from equator plane)
    const polarAngle = Math.atan2(Math.abs(pos.y), horizontalDist);
    const maxAngle = Math.PI / 2 - MAX_POLAR_ANGLE; // Max angle from equator

    if (polarAngle > maxAngle) {
      // Clamp to max angle while preserving horizontal direction and distance
      const sign = pos.y > 0 ? 1 : -1;
      const newY = Math.sin(maxAngle) * dist * sign;
      const newHorizontalDist = Math.cos(maxAngle) * dist;

      // Scale horizontal components to maintain direction
      if (horizontalDist > 0.001) {
        const scale = newHorizontalDist / horizontalDist;
        pos.x *= scale;
        pos.z *= scale;
      } else {
        // Camera is very close to pole - use last known horizontal direction or default
        const lastHorizDist = Math.sqrt(lastMouse.current.x * lastMouse.current.x + lastMouse.current.y * lastMouse.current.y);
        if (lastHorizDist > 0.01) {
          // Push away in opposite direction of last mouse movement
          pos.x = newHorizontalDist * (lastMouse.current.x > 0 ? -1 : 1);
          pos.z = newHorizontalDist * 0.5;
        } else {
          pos.x = newHorizontalDist;
          pos.z = 0;
        }
      }
      pos.y = newY;

      // Aggressively clear velocity to prevent oscillation/flickering
      velocity.current.set(0, 0, 0);
    }
  };

  // Raycast to find point on globe under cursor
  const getGlobeIntersection = (mouseX: number, mouseY: number): THREE.Vector3 | null => {
    raycaster.current.setFromCamera(new THREE.Vector2(mouseX, mouseY), camera);
    const intersectPoint = new THREE.Vector3();
    const hit = raycaster.current.ray.intersectSphere(globeSphere.current, intersectPoint);
    return hit ? intersectPoint : null;
  };

  // Rotate camera so that grabPoint appears at cursor position
  const rotateCameraToPoint = (targetPoint: THREE.Vector3) => {
    const grabDir = grabPoint.current.clone().normalize();
    const targetDir = targetPoint.clone().normalize();

    // Calculate how close we are to the poles (0 = equator, 1 = pole)
    const cameraDir = camera.position.clone().normalize();
    const polarProximity = Math.abs(cameraDir.y);

    // Dampen rotation when near poles to prevent wild spinning
    // As we get closer to poles, we interpolate less toward the target
    const poleDamping = Math.max(0.1, 1 - polarProximity * polarProximity * 1.5);

    // Find rotation from grabDir to targetDir
    const quaternion = new THREE.Quaternion();
    quaternion.setFromUnitVectors(targetDir, grabDir);

    // Apply dampened rotation - slerp from identity toward full rotation
    const identity = new THREE.Quaternion();
    quaternion.slerp(identity, 1 - poleDamping);

    // Apply rotation to camera position
    camera.position.applyQuaternion(quaternion);

    // Clamp to polar limits
    clampToPolarLimit();

    camera.lookAt(0, 0, 0);

    // Store rotation for momentum (also dampened)
    dragDelta.current.copy(quaternion);
  };

  // Animation loop - ALL camera updates happen here
  // Uses module-level temp vectors to avoid allocations
  useFrame(() => {
    const currentDist = camera.position.length();
    _tempVec3_1.copy(camera.position).normalize(); // currentDir

    // Clamp target distance (single source of truth)
    targetDistance.current = Math.max(MIN_CAMERA_DIST, Math.min(MAX_CAMERA_DIST, targetDistance.current));

    // When dragging, always sync targetDirection to prevent rubber banding
    if (isDragging.current) {
      targetDirection.current.copy(_tempVec3_1);
    }

    // Apply drag momentum when not dragging
    if (!isDragging.current && velocity.current.lengthSq() > MIN_VELOCITY * MIN_VELOCITY) {
      _tempVec3_2.copy(velocity.current).normalize(); // axis
      const angle = velocity.current.length();
      _tempQuat.setFromAxisAngle(_tempVec3_2, angle);

      camera.position.applyQuaternion(_tempQuat);
      targetDirection.current.copy(camera.position).normalize(); // Keep in sync
      clampToPolarLimit();
      velocity.current.multiplyScalar(DRAG_DAMPING);
    }

    // Smoothly interpolate distance
    const distDiff = targetDistance.current - currentDist;
    if (Math.abs(distDiff) > 0.00001) {
      const newDist = Math.max(HARD_FLOOR, currentDist + distDiff * ZOOM_SMOOTHING);
      camera.position.normalize().multiplyScalar(newDist);
    }

    // Smoothly interpolate direction (for zoom-to-cursor) - only when not dragging
    if (!isDragging.current) {
      const dirDot = _tempVec3_1.dot(targetDirection.current);
      if (dirDot < 0.9999 && dirDot > 0.99) { // Only interpolate if close enough (prevents jumps)
        _tempVec3_2.copy(_tempVec3_1).lerp(targetDirection.current, ZOOM_SMOOTHING).normalize();
        const dist = camera.position.length();
        camera.position.copy(_tempVec3_2.multiplyScalar(dist));
      }
    }

    // Always look at origin and enforce limits
    camera.lookAt(0, 0, 0);

    // Hard clamp - absolutely prevent going inside globe
    const camLen = camera.position.length();
    if (camLen < HARD_FLOOR) {
      camera.position.normalize().multiplyScalar(HARD_FLOOR);
      targetDistance.current = Math.max(MIN_CAMERA_DIST, targetDistance.current);
    }
  });

  // Event handlers
  useEffect(() => {
    const canvas = gl.domElement;

    const handleMouseDown = (e: MouseEvent) => {
      if (e.button !== 0 && e.button !== 2) return; // Left or right click only

      const coords = getMouseCoords(e);
      const intersection = getGlobeIntersection(coords.x, coords.y);

      if (intersection) {
        isDragging.current = true;
        grabPoint.current.copy(intersection);
        velocity.current.set(0, 0, 0); // Stop momentum
        lastMouse.current = coords;
        lastDragTime.current = performance.now();
        canvas.style.cursor = 'grabbing';
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;

      const coords = getMouseCoords(e);
      const intersection = getGlobeIntersection(coords.x, coords.y);

      if (intersection) {
        // Calculate velocity for momentum
        const now = performance.now();
        const dt = Math.max(1, now - lastDragTime.current);

        // Store camera position before rotation
        const prevPos = camera.position.clone();

        rotateCameraToPoint(intersection);

        // Calculate angular velocity from position change
        const posChange = camera.position.clone().sub(prevPos);
        const axis = new THREE.Vector3().crossVectors(prevPos.normalize(), camera.position.clone().normalize());
        const angle = prevPos.normalize().angleTo(camera.position.clone().normalize());

        if (axis.lengthSq() > 0.00001 && dt > 0) {
          axis.normalize();
          // Weighted average with previous velocity for smoother momentum
          const newVel = axis.multiplyScalar(angle * (16 / dt)); // Normalize to ~60fps
          velocity.current.lerp(newVel, 0.3);
        }

        lastMouse.current = coords;
        lastDragTime.current = now;
      }
    };

    const handleMouseUp = () => {
      if (isDragging.current) {
        isDragging.current = false;
        canvas.style.cursor = '';

        // If drag was very recent, keep momentum; otherwise clear it
        const timeSinceDrag = performance.now() - lastDragTime.current;
        if (timeSinceDrag > 100) {
          velocity.current.set(0, 0, 0);
        }
      }
    };

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();

      const currentDist = camera.position.length();
      const coords = getMouseCoords(e);

      // ALTITUDE-BASED LOGARITHMIC ZOOM
      // What matters perceptually is height above surface, not distance from center
      // altitude = distance - 1.0 (globe radius is 1.0)
      const GLOBE_RADIUS = 1.0;
      const minAltitude = MIN_CAMERA_DIST - GLOBE_RADIUS; // e.g., 0.0002
      const maxAltitude = MAX_CAMERA_DIST - GLOBE_RADIUS; // e.g., 49
      const currentAltitude = Math.max(minAltitude, targetDistance.current - GLOBE_RADIUS);

      // Work in log(altitude) space for perceptually uniform zoom
      const logMin = Math.log(minAltitude);
      const logMax = Math.log(maxAltitude);
      const logCurrent = Math.log(currentAltitude);

      // Each scroll moves a fixed percentage of the total log range
      // 0.03 = ~33 scroll steps from street level to full globe
      const logStep = (logMax - logMin) * ZOOM_SPEED * zoomSpeedMod.current;
      const direction = e.deltaY > 0 ? 1 : -1; // positive = zoom out, negative = zoom in

      const newLogAltitude = logCurrent + direction * logStep;
      const newAltitude = Math.exp(Math.max(logMin, Math.min(logMax, newLogAltitude)));
      const newTarget = newAltitude + GLOBE_RADIUS;
      targetDistance.current = newTarget;

      // Zoom toward cursor when zooming in (subtle effect)
      const intersection = getGlobeIntersection(coords.x, coords.y);
      if (intersection && currentDist < 6 && e.deltaY < 0) {
        const currentDir = camera.position.clone().normalize();
        const cursorDir = intersection.clone().normalize();
        targetDirection.current.copy(currentDir).lerp(cursorDir, 0.08).normalize();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Control') zoomSpeedMod.current = 3;
      if (e.key === 'Shift') zoomSpeedMod.current = 0.3;
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Control' || e.key === 'Shift') {
        zoomSpeedMod.current = 1;
      }
    };

    // Touch support
    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        const touch = e.touches[0];
        const coords = getMouseCoords(touch);
        const intersection = getGlobeIntersection(coords.x, coords.y);

        if (intersection) {
          isDragging.current = true;
          grabPoint.current.copy(intersection);
          velocity.current.set(0, 0, 0);
          lastMouse.current = coords;
          lastDragTime.current = performance.now();
        }
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 1 && isDragging.current) {
        e.preventDefault();
        const touch = e.touches[0];
        const coords = getMouseCoords(touch);
        const intersection = getGlobeIntersection(coords.x, coords.y);

        if (intersection) {
          const now = performance.now();
          const dt = Math.max(1, now - lastDragTime.current);
          const prevPos = camera.position.clone();

          rotateCameraToPoint(intersection);

          const axis = new THREE.Vector3().crossVectors(prevPos.normalize(), camera.position.clone().normalize());
          const angle = prevPos.normalize().angleTo(camera.position.clone().normalize());

          if (axis.lengthSq() > 0.00001 && dt > 0) {
            axis.normalize();
            const newVel = axis.multiplyScalar(angle * (16 / dt));
            velocity.current.lerp(newVel, 0.3);
          }

          lastMouse.current = coords;
          lastDragTime.current = now;
        }
      }
    };

    const handleTouchEnd = () => {
      if (isDragging.current) {
        isDragging.current = false;
        const timeSinceDrag = performance.now() - lastDragTime.current;
        if (timeSinceDrag > 100) {
          velocity.current.set(0, 0, 0);
        }
      }
    };

    // Attach events
    canvas.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    canvas.addEventListener('wheel', handleWheel, { passive: false });
    canvas.addEventListener('touchstart', handleTouchStart, { passive: true });
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
    canvas.addEventListener('touchend', handleTouchEnd);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    // Prevent context menu on right-click drag
    const preventContext = (e: Event) => e.preventDefault();
    canvas.addEventListener('contextmenu', preventContext);

    return () => {
      canvas.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      canvas.removeEventListener('wheel', handleWheel);
      canvas.removeEventListener('touchstart', handleTouchStart);
      canvas.removeEventListener('touchmove', handleTouchMove);
      canvas.removeEventListener('touchend', handleTouchEnd);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      canvas.removeEventListener('contextmenu', preventContext);
    };
  }, [camera, gl]);

  return null;
}

/* Camera controller for fly-to + zoom level tracking */
function CameraController() {
  const { camera } = useThree();
  const { flyTo, setFlyTo, setZoomLevel } = useAppState();
  const flyToRef = useRef<{ lat: number; lng: number; phase: 'rotate' | 'zoom'; targetDir: THREE.Vector3 } | null>(null);
  const lastZoomUpdate = useRef(0);
  const lastZoomValue = useRef(0);
  const flyTargetDistance = 1.15; // How close to zoom in when flying to location

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
    // Update zoom level in store (throttled + only when changed significantly)
    const currentDist = camera.position.length();
    const now = Date.now();
    if (now - lastZoomUpdate.current > 100) {
      // Only update if zoom changed by more than 1%
      if (Math.abs(currentDist - lastZoomValue.current) > lastZoomValue.current * 0.01) {
        lastZoomUpdate.current = now;
        lastZoomValue.current = currentDist;
        setZoomLevel(currentDist);
      }
    }

    // Handle fly-to animation (uses module temp vectors)
    if (flyToRef.current) {
      const { phase, targetDir } = flyToRef.current;
      const dist = camera.position.length();

      if (phase === 'rotate') {
        // Phase 1: Rotate to face the target location
        _tempVec3_1.copy(camera.position).normalize();
        const alignment = _tempVec3_1.dot(targetDir);

        _tempVec3_2.copy(_tempVec3_1).lerp(targetDir, 0.05).normalize();
        camera.position.copy(_tempVec3_2.multiplyScalar(dist));
        camera.lookAt(0, 0, 0);

        if (alignment > 0.99) {
          flyToRef.current.phase = 'zoom';
        }
      } else {
        // Phase 2: Zoom in to the target while maintaining direction
        _tempVec3_1.copy(camera.position).normalize();
        _tempVec3_2.copy(_tempVec3_1).lerp(flyToRef.current.targetDir, 0.03).normalize();
        const newDist = dist + (flyTargetDistance - dist) * 0.05;

        camera.position.copy(_tempVec3_2.multiplyScalar(newDist));
        camera.lookAt(0, 0, 0);

        if (Math.abs(dist - flyTargetDistance) < 0.03) {
          flyToRef.current = null;
        }
      }
    }
  });

  return null;
}

/* Auto-rotation that stops on user interaction, can be resumed */
function AutoRotation() {
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
    camera.lookAt(0, 0, 0);
  });

  return null;
}

function SceneContent() {
  const { pickingLocation } = useAppState();

  return (
    <>
      {/* Warm, soft lighting */}
      <ambientLight intensity={0.35} color="#ffe8d0" />
      <directionalLight position={[5, 4, 3]} intensity={0.6} color="#ffd9b3" />
      <directionalLight position={[-3, 2, -2]} intensity={0.15} color="#d4c4a8" />

      <DustMotes count={DUST_COUNT} />

      <group>
        <Earth />
        <CountryBorders />
        <DetailLayer />
        <StreetTiles />
        <BenchMarkers pickingLocation={pickingLocation} />
      </group>

      <AutoRotation />
      <GlobeController />
      <CameraController />
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
        camera={{ position: [0, 0.3, 2.8], fov: 50, near: 0.0001, far: 100 }}
        dpr={[1, 2]}
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

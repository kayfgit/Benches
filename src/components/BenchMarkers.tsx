'use client';

import { useRef, useCallback, useState, WheelEvent as ReactWheelEvent } from 'react';
import { useFrame, useThree, ThreeEvent } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import type { Bench } from '@/types';
import { useAppState } from '@/lib/store';

// Forward wheel events to canvas for zooming
function useWheelPassthrough() {
  const { gl } = useThree();
  return useCallback((e: ReactWheelEvent) => {
    const canvas = gl.domElement;
    const wheelEvent = new WheelEvent('wheel', {
      deltaY: e.deltaY,
      deltaX: e.deltaX,
      clientX: e.clientX,
      clientY: e.clientY,
      bubbles: true,
    });
    canvas.dispatchEvent(wheelEvent);
  }, [gl]);
}

const DEG2RAD = Math.PI / 180;
const GLOBE_RADIUS = 1;

export function latLonToVec3(lat: number, lon: number, radius: number): THREE.Vector3 {
  const phi = (90 - lat) * DEG2RAD;
  const theta = (lon + 180) * DEG2RAD;
  return new THREE.Vector3(
    -(radius * Math.sin(phi) * Math.cos(theta)),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}

function vec3ToLatLon(point: THREE.Vector3): { lat: number; lng: number } {
  const r = point.length();
  const lat = 90 - Math.acos(point.y / r) * (180 / Math.PI);
  // Inverse of latLonToVec3: theta = atan2(z, -x), lon = theta * RAD2DEG - 180
  const theta = Math.atan2(point.z, -point.x);
  const lng = theta * (180 / Math.PI) - 180;
  const normalizedLng = ((lng + 540) % 360) - 180;
  return { lat, lng: normalizedLng };
}

/* Custom bench SVG icon */
function BenchIcon({ style }: { style?: React.CSSProperties }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
    >
      <path d="M5 6h14" />
      <path d="M6 6v5" />
      <path d="M18 6v5" />
      <path d="M3 11h18" />
      <path d="M5 11v6" />
      <path d="M19 11v6" />
      <path d="M3 9h3" />
      <path d="M18 9h3" />
    </svg>
  );
}

/* A single bench marker */
function SingleMarker({
  bench,
  isSelected,
}: {
  bench: Bench;
  isSelected: boolean;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const { camera } = useThree();
  const { setSelectedBench, transitioningBenchId } = useAppState();
  const [visible, setVisible] = useState(true);
  const [hovered, setHovered] = useState(false);
  const handleWheel = useWheelPassthrough();

  // Hide this marker if it's the one being transitioned (the picked location marker shows the animation)
  const isTransitioning = transitioningBenchId === bench.id;

  useFrame(() => {
    if (!groupRef.current) return;

    // Position exactly on globe surface (minimal offset to avoid z-fighting)
    const pos = latLonToVec3(bench.latitude, bench.longitude, GLOBE_RADIUS + 0.001);
    groupRef.current.position.copy(pos);

    // Occlusion: marker visible if its surface normal faces the camera
    const worldPos = new THREE.Vector3();
    groupRef.current.getWorldPosition(worldPos);
    const normal = worldPos.clone().normalize();
    const toCamera = camera.position.clone().sub(worldPos).normalize();
    const dot = normal.dot(toCamera);
    setVisible(dot > 0.15);

    // No scaling needed - pins stay fixed screen size
  });

  const baseSize = isSelected ? 26 : 22;

  // Don't render if transitioning (the picked location marker shows the animation instead)
  const showMarker = visible && !isTransitioning;

  return (
    <group ref={groupRef}>
      <Html
        center
        zIndexRange={[0, 0]}
        style={{
          opacity: showMarker ? 1 : 0,
          transition: 'opacity 0.25s ease',
          pointerEvents: 'none', // Let wheel events pass through
        }}
      >
        <div
          className="flex flex-col items-center select-none"
          onClick={(e) => {
            e.stopPropagation();
            setSelectedBench(isSelected ? null : bench);
          }}
          onWheel={handleWheel}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          style={{
            cursor: 'pointer',
            pointerEvents: showMarker ? 'auto' : 'none',
          }}
        >
          <div
            className="relative flex items-center justify-center"
            style={{
              width: baseSize,
              height: baseSize,
              borderRadius: `50% 50% 50% ${Math.max(2, baseSize * 0.15)}px`,
              transform: 'rotate(-45deg)',
              transition: 'background 0.2s, box-shadow 0.2s',
              background: isSelected
                ? 'linear-gradient(135deg, #e0b07a, #c9945a)'
                : hovered
                ? 'linear-gradient(135deg, #c9945a, #a87840)'
                : 'linear-gradient(135deg, #b08050, #8a6535)',
              boxShadow: isSelected
                ? '0 4px 20px rgba(201,148,90,0.5), 0 0 0 3px rgba(201,148,90,0.2)'
                : hovered
                ? '0 3px 14px rgba(201,148,90,0.35)'
                : '0 2px 8px rgba(0,0,0,0.35)',
            }}
          >
            <div
              style={{
                transform: 'rotate(45deg)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <BenchIcon
                style={{
                  width: baseSize * 0.55,
                  height: baseSize * 0.55,
                  color: isSelected ? '#17130e' : '#f0e6d8',
                  transition: 'color 0.2s',
                }}
              />
            </div>
          </div>

          {(hovered || isSelected) && (
            <div
              className="mt-1 px-1.5 py-0.5 rounded text-center whitespace-nowrap"
              style={{
                background: 'rgba(33,28,21,0.88)',
                border: '1px solid rgba(68,59,48,0.5)',
                backdropFilter: 'blur(8px)',
                fontSize: 10,
                fontFamily: "'Outfit', sans-serif",
                fontWeight: 500,
                color: '#f0e6d8',
                maxWidth: 120,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                letterSpacing: '0.01em',
              }}
            >
              {bench.name}
            </div>
          )}
        </div>
      </Html>
    </group>
  );
}

/* Picked-location marker (green pin when adding a bench) */
function PickedLocationMarker() {
  const { pickedLocation, transitioningBenchId } = useAppState();
  const groupRef = useRef<THREE.Group>(null);
  const handleWheel = useWheelPassthrough();
  const isTransitioning = transitioningBenchId !== null;

  useFrame(() => {
    if (!groupRef.current || !pickedLocation) return;
    const pos = latLonToVec3(pickedLocation.lat, pickedLocation.lng, GLOBE_RADIUS + 0.001);
    groupRef.current.position.copy(pos);
  });

  if (!pickedLocation) return null;

  // Colors and styles based on transition state
  const pinBackground = isTransitioning
    ? 'linear-gradient(135deg, #c9945a, #8a6535)'
    : 'linear-gradient(135deg, #a3c2a5, #6b8f6e)';
  const pinShadow = isTransitioning
    ? '0 2px 10px rgba(201,148,90,0.45)'
    : '0 2px 10px rgba(107,143,110,0.45)';
  const textColor = isTransitioning ? '#c9945a' : '#a3c2a5';

  return (
    <group ref={groupRef}>
      <Html center style={{ pointerEvents: 'none' }}>
        <div
          className={`flex flex-col items-center select-none ${isTransitioning ? '' : 'animate-bounce'}`}
          onWheel={handleWheel}
          style={{ pointerEvents: 'auto' }}
        >
          <div
            style={{
              width: 22,
              height: 22,
              borderRadius: '50% 50% 50% 3px',
              transform: 'rotate(-45deg)',
              background: pinBackground,
              boxShadow: pinShadow,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.5s ease-out',
            }}
          >
            {/* Plus icon (fades out) */}
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="#17130e"
              strokeWidth="2.5"
              strokeLinecap="round"
              style={{
                width: 10,
                height: 10,
                transform: 'rotate(45deg)',
                position: 'absolute',
                opacity: isTransitioning ? 0 : 1,
                transition: 'opacity 0.3s ease-out',
              }}
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
            {/* Bench icon (fades in) */}
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke={isTransitioning ? '#17130e' : '#17130e'}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{
                width: 12,
                height: 12,
                transform: 'rotate(45deg)',
                position: 'absolute',
                opacity: isTransitioning ? 1 : 0,
                transition: 'opacity 0.3s ease-out 0.2s',
              }}
            >
              <path d="M5 6h14" />
              <path d="M6 6v5" />
              <path d="M18 6v5" />
              <path d="M3 11h18" />
              <path d="M5 11v6" />
              <path d="M19 11v6" />
            </svg>
          </div>
          <div
            className="mt-1 px-1.5 py-0.5 rounded"
            style={{
              background: 'rgba(33,28,21,0.88)',
              border: '1px solid rgba(68,59,48,0.5)',
              fontSize: 9,
              fontFamily: "'JetBrains Mono', monospace",
              color: textColor,
              opacity: isTransitioning ? 0 : 1,
              transition: 'all 0.3s ease-out',
            }}
          >
            {pickedLocation.lat.toFixed(4)}, {pickedLocation.lng.toFixed(4)}
          </div>
        </div>
      </Html>
    </group>
  );
}

/* Invisible sphere for click-to-pick */
function GlobeClickHandler() {
  const { pickingLocation, setPickingLocation, setPickedLocation } = useAppState();

  const handleClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      if (!pickingLocation) return;
      e.stopPropagation();
      const { lat, lng } = vec3ToLatLon(e.point);
      setPickedLocation({
        lat: Math.round(lat * 10000) / 10000,
        lng: Math.round(lng * 10000) / 10000,
      });
      // Auto-toggle off picking mode after selecting
      setPickingLocation(false);
    },
    [pickingLocation, setPickingLocation, setPickedLocation]
  );

  return (
    <mesh visible={false} onClick={handleClick}>
      <sphereGeometry args={[GLOBE_RADIUS + 0.001, 64, 32]} />
      <meshBasicMaterial transparent opacity={0} />
    </mesh>
  );
}

export function BenchMarkers({
  benches,
  pickingLocation,
}: {
  benches: Bench[];
  pickingLocation: boolean;
}) {
  const { selectedBench } = useAppState();

  return (
    <group>
      {benches.map((bench) => (
        <SingleMarker
          key={bench.id}
          bench={bench}
          isSelected={selectedBench?.id === bench.id}
        />
      ))}
      {pickingLocation && <GlobeClickHandler />}
      <PickedLocationMarker />
    </group>
  );
}

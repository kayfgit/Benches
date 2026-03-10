'use client';

import { useRef, useCallback, useState } from 'react';
import { useFrame, useThree, ThreeEvent } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import type { Bench } from '@/types';
import { useAppState } from '@/lib/store';

const DEG2RAD = Math.PI / 180;
const GLOBE_RADIUS = 1;
const MAP_WIDTH = 3.6;
const MAX_LAT = 82;
const maxMercY = Math.log(Math.tan(Math.PI / 4 + (MAX_LAT * DEG2RAD) / 2));

export function latLonToVec3(lat: number, lon: number, radius: number): THREE.Vector3 {
  const phi = (90 - lat) * DEG2RAD;
  const theta = (lon + 180) * DEG2RAD;
  return new THREE.Vector3(
    -(radius * Math.sin(phi) * Math.cos(theta)),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}

function latLonToFlat(lat: number, lon: number): THREE.Vector3 {
  const u = (lon + 180) / 360;
  const clamped = Math.max(-MAX_LAT, Math.min(MAX_LAT, lat));
  const latRad = clamped * DEG2RAD;
  const mercY = Math.log(Math.tan(Math.PI / 4 + latRad / 2));
  return new THREE.Vector3(
    (u - 0.5) * MAP_WIDTH,
    (mercY / maxMercY) * (MAP_WIDTH / 2) * 0.55,
    0.02
  );
}

function vec3ToLatLon(point: THREE.Vector3): { lat: number; lng: number } {
  const r = point.length();
  const lat = 90 - Math.acos(point.y / r) * (180 / Math.PI);
  const lng = -Math.atan2(-point.z, point.x) * (180 / Math.PI) - 180;
  const normalizedLng = ((lng + 540) % 360) - 180;
  return { lat, lng: normalizedLng };
}

/* Custom bench SVG icon */
function BenchIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {/* Back top rail */}
      <path d="M5 6h14" />
      {/* Back uprights */}
      <path d="M6 6v5" />
      <path d="M18 6v5" />
      {/* Seat */}
      <path d="M3 11h18" />
      {/* Legs */}
      <path d="M5 11v6" />
      <path d="M19 11v6" />
      {/* Armrests */}
      <path d="M3 9h3" />
      <path d="M18 9h3" />
    </svg>
  );
}

/* A single bench marker rendered as Html overlay */
function SingleMarker({
  bench,
  morphFactor,
  isSelected,
}: {
  bench: Bench;
  morphFactor: number;
  isSelected: boolean;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const { camera } = useThree();
  const { setSelectedBench } = useAppState();
  const [visible, setVisible] = useState(true);
  const [hovered, setHovered] = useState(false);

  useFrame(() => {
    if (!groupRef.current) return;

    // Position: lerp between globe and flat
    const spherePos = latLonToVec3(bench.latitude, bench.longitude, GLOBE_RADIUS + 0.02);
    const flatPos = latLonToFlat(bench.latitude, bench.longitude);
    groupRef.current.position.lerpVectors(spherePos, flatPos, morphFactor);

    // Occlusion via dot product (globe mode only)
    if (morphFactor < 0.5) {
      const markerDir = spherePos.clone().normalize();
      const camDir = camera.position.clone().normalize();
      const dot = markerDir.dot(camDir);
      setVisible(dot > -0.05);
    } else {
      setVisible(true);
    }
  });

  return (
    <group ref={groupRef}>
      <Html
        center
        style={{
          opacity: visible ? 1 : 0,
          transition: 'opacity 0.25s ease',
          pointerEvents: visible ? 'auto' : 'none',
        }}
        distanceFactor={2.4}
      >
        <div
          className="flex flex-col items-center select-none"
          onClick={(e) => {
            e.stopPropagation();
            setSelectedBench(isSelected ? null : bench);
          }}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          style={{ cursor: 'pointer' }}
        >
          {/* Icon badge */}
          <div
            className="relative flex items-center justify-center transition-all duration-200"
            style={{
              width: isSelected ? 44 : hovered ? 40 : 36,
              height: isSelected ? 44 : hovered ? 40 : 36,
              borderRadius: '50% 50% 50% 4px',
              transform: 'rotate(-45deg)',
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
            <div style={{ transform: 'rotate(45deg)' }}>
              <BenchIcon
                className={`transition-all duration-200 ${
                  isSelected ? 'w-5 h-5 text-[#17130e]' : 'w-4 h-4 text-[#f0e6d8]'
                }`}
              />
            </div>
          </div>

          {/* Name label — show on hover or selected */}
          {(hovered || isSelected) && (
            <div
              className="mt-1.5 px-2 py-0.5 rounded text-center whitespace-nowrap"
              style={{
                background: 'rgba(33,28,21,0.88)',
                border: '1px solid rgba(68,59,48,0.5)',
                backdropFilter: 'blur(8px)',
                fontSize: 10,
                fontFamily: "'Outfit', sans-serif",
                fontWeight: 500,
                color: '#f0e6d8',
                maxWidth: 140,
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
function PickedLocationMarker({ morphFactor }: { morphFactor: number }) {
  const { pickedLocation } = useAppState();
  const groupRef = useRef<THREE.Group>(null);

  useFrame(() => {
    if (!groupRef.current || !pickedLocation) return;
    const spherePos = latLonToVec3(pickedLocation.lat, pickedLocation.lng, GLOBE_RADIUS + 0.025);
    const flatPos = latLonToFlat(pickedLocation.lat, pickedLocation.lng);
    groupRef.current.position.lerpVectors(spherePos, flatPos, morphFactor);
  });

  if (!pickedLocation) return null;

  return (
    <group ref={groupRef}>
      <Html center distanceFactor={2.4}>
        <div className="flex flex-col items-center animate-bounce">
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: '50% 50% 50% 4px',
              transform: 'rotate(-45deg)',
              background: 'linear-gradient(135deg, #a3c2a5, #6b8f6e)',
              boxShadow: '0 3px 14px rgba(107,143,110,0.45)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="#17130e"
              strokeWidth="2.5"
              strokeLinecap="round"
              style={{ width: 14, height: 14, transform: 'rotate(45deg)' }}
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
          </div>
          <div
            className="mt-1 px-2 py-0.5 rounded"
            style={{
              background: 'rgba(33,28,21,0.88)',
              border: '1px solid rgba(68,59,48,0.5)',
              fontSize: 10,
              fontFamily: "'JetBrains Mono', monospace",
              color: '#a3c2a5',
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
  const { pickingLocation, setPickedLocation } = useAppState();

  const handleClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      if (!pickingLocation) return;
      e.stopPropagation();
      const { lat, lng } = vec3ToLatLon(e.point);
      setPickedLocation({
        lat: Math.round(lat * 10000) / 10000,
        lng: Math.round(lng * 10000) / 10000,
      });
    },
    [pickingLocation, setPickedLocation]
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
  morphFactor,
  pickingLocation,
}: {
  benches: Bench[];
  morphFactor: number;
  pickingLocation: boolean;
}) {
  const { selectedBench } = useAppState();

  return (
    <group>
      {benches.map((bench) => (
        <SingleMarker
          key={bench.id}
          bench={bench}
          morphFactor={morphFactor}
          isSelected={selectedBench?.id === bench.id}
        />
      ))}
      {pickingLocation && <GlobeClickHandler />}
      <PickedLocationMarker morphFactor={morphFactor} />
    </group>
  );
}

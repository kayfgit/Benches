'use client';

import { useRef, useCallback } from 'react';
import { useFrame, useThree, ThreeEvent } from '@react-three/fiber';
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
    0.01
  );
}

function vec3ToLatLon(point: THREE.Vector3): { lat: number; lng: number } {
  const r = point.length();
  const lat = 90 - Math.acos(point.y / r) * (180 / Math.PI);
  const lng = -Math.atan2(-point.z, point.x) * (180 / Math.PI) - 180;
  const normalizedLng = ((lng + 540) % 360) - 180;
  return { lat, lng: normalizedLng };
}

const markerColor = new THREE.Color('#c9945a');
const markerEmissive = new THREE.Color('#e0b07a');
const pickerColor = new THREE.Color('#6b8f6e');
const selectedColor = new THREE.Color('#f0d9a8');

function SingleMarker({
  bench,
  morphFactor,
  isSelected,
}: {
  bench: Bench;
  morphFactor: number;
  isSelected: boolean;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const { camera } = useThree();
  const { setSelectedBench } = useAppState();
  const opacityRef = useRef(1);

  useFrame((_, dt) => {
    if (!meshRef.current) return;

    const spherePos = latLonToVec3(bench.latitude, bench.longitude, GLOBE_RADIUS + 0.012);
    const flatPos = latLonToFlat(bench.latitude, bench.longitude);
    const t = morphFactor;

    meshRef.current.position.lerpVectors(spherePos, flatPos, t);

    // Occlusion: check if marker faces camera
    if (t < 0.5) {
      const markerDir = spherePos.clone().normalize();
      const camDir = camera.position.clone().normalize();
      const dot = markerDir.dot(camDir);
      const targetOp = dot > -0.05 ? 1 : 0;
      opacityRef.current += (targetOp - opacityRef.current) * Math.min(dt * 8, 1);
    } else {
      opacityRef.current += (1 - opacityRef.current) * Math.min(dt * 8, 1);
    }

    const mat = meshRef.current.material as THREE.MeshStandardMaterial;
    mat.opacity = opacityRef.current;
    meshRef.current.visible = opacityRef.current > 0.02;

    // Pulse ring for selected
    if (ringRef.current) {
      ringRef.current.position.copy(meshRef.current.position);
      const scale = isSelected ? 1 + Math.sin(Date.now() * 0.004) * 0.3 : 0;
      ringRef.current.scale.setScalar(scale);
      ringRef.current.visible = isSelected && opacityRef.current > 0.5;
      ringRef.current.lookAt(camera.position);
    }

    // Scale based on distance for better visibility
    const dist = camera.position.distanceTo(meshRef.current.position);
    const s = THREE.MathUtils.clamp(dist * 0.22, 0.08, 0.4);
    meshRef.current.scale.setScalar(isSelected ? s * 1.3 : s);
  });

  return (
    <>
      <mesh
        ref={meshRef}
        onClick={(e) => {
          e.stopPropagation();
          setSelectedBench(isSelected ? null : bench);
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          document.body.style.cursor = '';
        }}
      >
        <sphereGeometry args={[0.015, 12, 12]} />
        <meshStandardMaterial
          color={isSelected ? selectedColor : markerColor}
          emissive={isSelected ? selectedColor : markerEmissive}
          emissiveIntensity={isSelected ? 1.2 : 0.6}
          transparent
          depthWrite={false}
        />
      </mesh>
      <mesh ref={ringRef}>
        <ringGeometry args={[0.018, 0.024, 24]} />
        <meshBasicMaterial
          color={markerEmissive}
          transparent
          opacity={0.5}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
    </>
  );
}

function PickedLocationMarker({ morphFactor }: { morphFactor: number }) {
  const { pickedLocation } = useAppState();
  const meshRef = useRef<THREE.Mesh>(null);
  const { camera } = useThree();

  useFrame(() => {
    if (!meshRef.current || !pickedLocation) return;

    const spherePos = latLonToVec3(pickedLocation.lat, pickedLocation.lng, GLOBE_RADIUS + 0.015);
    const flatPos = latLonToFlat(pickedLocation.lat, pickedLocation.lng);
    meshRef.current.position.lerpVectors(spherePos, flatPos, morphFactor);

    const dist = camera.position.distanceTo(meshRef.current.position);
    const s = THREE.MathUtils.clamp(dist * 0.3, 0.1, 0.5);
    meshRef.current.scale.setScalar(s + Math.sin(Date.now() * 0.005) * s * 0.2);
  });

  if (!pickedLocation) return null;

  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[0.018, 12, 12]} />
      <meshStandardMaterial
        color={pickerColor}
        emissive={pickerColor}
        emissiveIntensity={1}
        transparent
        opacity={0.9}
        depthWrite={false}
      />
    </mesh>
  );
}

function GlobeClickHandler() {
  const { pickingLocation, setPickedLocation } = useAppState();

  const handleClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      if (!pickingLocation) return;
      e.stopPropagation();
      const point = e.point;
      const { lat, lng } = vec3ToLatLon(point);
      setPickedLocation({ lat: Math.round(lat * 10000) / 10000, lng: Math.round(lng * 10000) / 10000 });
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

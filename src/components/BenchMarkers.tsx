'use client';

import { useRef, useCallback, useState, useMemo, WheelEvent as ReactWheelEvent, memo } from 'react';
import { useFrame, useThree, ThreeEvent } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { useAppState } from '@/lib/store';
import type { Bench } from '@/types';

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
const RAD2DEG = 180 / Math.PI;
const GLOBE_RADIUS = 1;
const MARKER_HEIGHT = 0.0004; // Minimal offset above other layers for precision

// Visibility thresholds for local benches (non-top-10 globally)
const LOCAL_BENCH_FADE_START = 1.8; // Start fading in at this zoom level
const LOCAL_BENCH_FADE_END = 1.3;   // Fully visible at this zoom level

// Clustering settings
const CLUSTER_DISTANCE = 0.08; // Distance in 3D units to cluster markers
const CLUSTER_ZOOM_THRESHOLD = 1.6; // Show clusters when zoomed out past this

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

// Reusable temp vectors to avoid allocations in useFrame
const _worldPos = new THREE.Vector3();
const _normal = new THREE.Vector3();
const _toCamera = new THREE.Vector3();

/* A single bench marker with visual differentiation */
function SingleMarker({
  bench,
  isSelected,
  isTopBench,
  rank,
}: {
  bench: Bench;
  isSelected: boolean;
  isTopBench: boolean; // Top 10 globally - always visible with special styling
  rank?: number; // 1-10 for top benches
}) {
  const groupRef = useRef<THREE.Group>(null);
  const htmlRef = useRef<HTMLDivElement>(null);
  const { camera } = useThree();
  const { setSelectedBench, transitioningBenchId } = useAppState();
  const [hovered, setHovered] = useState(false);
  const handleWheel = useWheelPassthrough();

  // Use refs instead of state for values updated in useFrame
  const visibleRef = useRef(true);
  const zoomOpacityRef = useRef(1);

  // Hide this marker if it's the one being transitioned
  const isTransitioning = transitioningBenchId === bench.id;

  // Precompute marker position
  const markerPos = useMemo(
    () => latLonToVec3(bench.latitude, bench.longitude, GLOBE_RADIUS + MARKER_HEIGHT),
    [bench.latitude, bench.longitude]
  );

  useFrame(() => {
    if (!groupRef.current) return;

    groupRef.current.position.copy(markerPos);

    // Occlusion check
    groupRef.current.getWorldPosition(_worldPos);
    _normal.copy(_worldPos).normalize();
    _toCamera.copy(camera.position).sub(_worldPos).normalize();
    const dot = _normal.dot(_toCamera);
    visibleRef.current = dot > 0.15;

    // Zoom-based opacity for local (non-top) benches
    if (!isTopBench) {
      const dist = camera.position.length();
      let targetOpacity = 0;

      if (dist <= LOCAL_BENCH_FADE_END) {
        targetOpacity = 1;
      } else if (dist >= LOCAL_BENCH_FADE_START) {
        targetOpacity = 0;
      } else {
        targetOpacity = 1 - (dist - LOCAL_BENCH_FADE_END) / (LOCAL_BENCH_FADE_START - LOCAL_BENCH_FADE_END);
      }

      const diff = targetOpacity - zoomOpacityRef.current;
      if (Math.abs(diff) >= 0.01) {
        const speed = diff < 0 ? 0.3 : 0.15;
        zoomOpacityRef.current += diff * speed;
      } else {
        zoomOpacityRef.current = targetOpacity;
      }
    }

    // Update DOM directly
    if (htmlRef.current) {
      const markerOpacity = (isTopBench || isSelected) ? 1 : zoomOpacityRef.current;
      const showMarker = visibleRef.current && !isTransitioning && markerOpacity > 0.01;
      htmlRef.current.style.opacity = showMarker ? String(markerOpacity) : '0';
      htmlRef.current.style.pointerEvents = showMarker ? 'auto' : 'none';
    }
  });

  // Visual differentiation: top benches are larger with gold glow
  const baseSize = isTopBench ? (isSelected ? 30 : 26) : (isSelected ? 24 : 18);

  // Top bench styling: golden glow, always show label
  const isGolden = isTopBench && !isSelected;

  return (
    <group ref={groupRef}>
      <Html
        center
        zIndexRange={[0, 0]}
        style={{
          transition: 'opacity 0.15s ease',
        }}
      >
        <div
          ref={htmlRef}
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
            opacity: 1,
          }}
        >
          <div
            className="relative flex items-center justify-center"
            style={{
              width: baseSize,
              height: baseSize,
              borderRadius: `50% 50% 50% ${Math.max(2, baseSize * 0.15)}px`,
              transform: 'rotate(-45deg)',
              transition: 'all 0.2s ease',
              background: isSelected
                ? 'linear-gradient(135deg, #f0c878, #d4a04a)'
                : isGolden
                ? 'linear-gradient(135deg, #e8c060, #c9945a)'
                : hovered
                ? 'linear-gradient(135deg, #a88050, #8a6535)'
                : 'linear-gradient(135deg, #907050, #6a5030)',
              boxShadow: isSelected
                ? '0 4px 24px rgba(212,160,74,0.6), 0 0 0 3px rgba(212,160,74,0.25)'
                : isGolden
                ? '0 3px 16px rgba(201,148,90,0.5), 0 0 12px rgba(232,192,96,0.3)'
                : hovered
                ? '0 2px 10px rgba(0,0,0,0.4)'
                : '0 1px 6px rgba(0,0,0,0.3)',
            }}
          >
            {/* Rank badge for top 3 */}
            {isTopBench && rank && rank <= 3 && !isSelected && (
              <div
                style={{
                  position: 'absolute',
                  top: -6,
                  right: -6,
                  width: 14,
                  height: 14,
                  borderRadius: '50%',
                  background: rank === 1 ? '#ffd700' : rank === 2 ? '#c0c0c0' : '#cd7f32',
                  transform: 'rotate(45deg)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 8,
                  fontWeight: 700,
                  color: '#17130e',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                }}
              >
                {rank}
              </div>
            )}
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
                  color: isSelected || isGolden ? '#17130e' : '#e8dcc8',
                  transition: 'color 0.2s',
                }}
              />
            </div>
          </div>

          {/* Label: always show for top benches, hover only for locals */}
          {(isTopBench || hovered || isSelected) && (
            <div
              className="mt-1 px-1.5 py-0.5 rounded text-center whitespace-nowrap"
              style={{
                background: isTopBench ? 'rgba(33,28,21,0.92)' : 'rgba(33,28,21,0.85)',
                border: isTopBench ? '1px solid rgba(201,148,90,0.4)' : '1px solid rgba(68,59,48,0.5)',
                backdropFilter: 'blur(8px)',
                fontSize: isTopBench ? 11 : 10,
                fontFamily: "'Outfit', sans-serif",
                fontWeight: isTopBench ? 600 : 500,
                color: isTopBench ? '#f0d8b0' : '#f0e6d8',
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

/* Cluster marker - shows count of grouped benches */
function ClusterMarker({
  position,
  count,
  benches,
}: {
  position: THREE.Vector3;
  count: number;
  benches: Bench[];
}) {
  const groupRef = useRef<THREE.Group>(null);
  const htmlRef = useRef<HTMLDivElement>(null);
  const { camera } = useThree();
  const { setSelectedBench } = useAppState();
  const [hovered, setHovered] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const handleWheel = useWheelPassthrough();
  const visibleRef = useRef(true);

  useFrame(() => {
    if (!groupRef.current) return;

    groupRef.current.position.copy(position);

    // Occlusion check
    groupRef.current.getWorldPosition(_worldPos);
    _normal.copy(_worldPos).normalize();
    _toCamera.copy(camera.position).sub(_worldPos).normalize();
    const dot = _normal.dot(_toCamera);
    visibleRef.current = dot > 0.15;

    if (htmlRef.current) {
      htmlRef.current.style.opacity = visibleRef.current ? '1' : '0';
      htmlRef.current.style.pointerEvents = visibleRef.current ? 'auto' : 'none';
    }
  });

  const size = Math.min(36, 20 + count * 2);

  return (
    <group ref={groupRef}>
      <Html center zIndexRange={[0, 0]}>
        <div
          ref={htmlRef}
          className="flex flex-col items-center select-none"
          onWheel={handleWheel}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => { setHovered(false); setExpanded(false); }}
          onClick={() => setExpanded(!expanded)}
          style={{ cursor: 'pointer' }}
        >
          <div
            style={{
              width: size,
              height: size,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #6a8070, #4a6050)',
              boxShadow: hovered
                ? '0 3px 14px rgba(106,128,112,0.5)'
                : '0 2px 8px rgba(0,0,0,0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: count > 99 ? 10 : 12,
              fontWeight: 700,
              color: '#f0e6d8',
              fontFamily: "'JetBrains Mono', monospace",
              transition: 'all 0.2s ease',
              border: '2px solid rgba(240,230,216,0.3)',
            }}
          >
            {count}
          </div>

          {/* Expanded list on hover */}
          {expanded && (
            <div
              className="mt-2 rounded overflow-hidden"
              style={{
                background: 'rgba(33,28,21,0.95)',
                border: '1px solid rgba(68,59,48,0.6)',
                backdropFilter: 'blur(12px)',
                maxHeight: 150,
                overflowY: 'auto',
                minWidth: 120,
              }}
            >
              {benches.slice(0, 5).map((bench) => (
                <div
                  key={bench.id}
                  className="px-2 py-1 hover:bg-[rgba(201,148,90,0.2)] cursor-pointer"
                  style={{
                    fontSize: 10,
                    fontFamily: "'Outfit', sans-serif",
                    color: '#f0e6d8',
                    borderBottom: '1px solid rgba(68,59,48,0.3)',
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedBench(bench);
                  }}
                >
                  {bench.name}
                </div>
              ))}
              {benches.length > 5 && (
                <div
                  className="px-2 py-1 text-center"
                  style={{
                    fontSize: 9,
                    color: '#a89880',
                    fontStyle: 'italic',
                  }}
                >
                  +{benches.length - 5} more
                </div>
              )}
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
    const pos = latLonToVec3(pickedLocation.lat, pickedLocation.lng, GLOBE_RADIUS + MARKER_HEIGHT);
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
      <sphereGeometry args={[GLOBE_RADIUS + MARKER_HEIGHT, 64, 32]} />
      <meshBasicMaterial transparent opacity={0} />
    </mesh>
  );
}

// Helper to get camera look-at point as lat/lng
function getCameraLatLng(camera: THREE.Camera): { lat: number; lng: number } {
  const pos = camera.position.clone().normalize();
  const lat = 90 - Math.acos(pos.y) * RAD2DEG;
  const lng = Math.atan2(pos.z, -pos.x) * RAD2DEG - 180;
  return { lat, lng: ((lng + 540) % 360) - 180 };
}

// Simple grid-based clustering
function clusterBenches(
  benches: Bench[],
  topBenchIds: Set<string>,
  clusterDistance: number
): { clusters: { position: THREE.Vector3; benches: Bench[] }[]; singles: Bench[] } {
  const singles: Bench[] = [];
  const toCluster: { bench: Bench; pos: THREE.Vector3 }[] = [];

  // Separate top benches (never clustered) from others
  for (const bench of benches) {
    if (topBenchIds.has(bench.id)) {
      singles.push(bench);
    } else {
      const pos = latLonToVec3(bench.latitude, bench.longitude, GLOBE_RADIUS + MARKER_HEIGHT);
      toCluster.push({ bench, pos });
    }
  }

  // Simple clustering: group by proximity
  const clusters: { position: THREE.Vector3; benches: Bench[] }[] = [];
  const used = new Set<number>();

  for (let i = 0; i < toCluster.length; i++) {
    if (used.has(i)) continue;

    const group: Bench[] = [toCluster[i].bench];
    const center = toCluster[i].pos.clone();
    used.add(i);

    for (let j = i + 1; j < toCluster.length; j++) {
      if (used.has(j)) continue;

      const dist = center.distanceTo(toCluster[j].pos);
      if (dist < clusterDistance) {
        group.push(toCluster[j].bench);
        used.add(j);
      }
    }

    if (group.length === 1) {
      singles.push(group[0]);
    } else {
      // Calculate cluster center
      const avgPos = new THREE.Vector3();
      for (const bench of group) {
        avgPos.add(latLonToVec3(bench.latitude, bench.longitude, GLOBE_RADIUS + MARKER_HEIGHT));
      }
      avgPos.divideScalar(group.length).normalize().multiplyScalar(GLOBE_RADIUS + MARKER_HEIGHT);
      clusters.push({ position: avgPos, benches: group });
    }
  }

  return { clusters, singles };
}

export function BenchMarkers({
  pickingLocation,
}: {
  pickingLocation: boolean;
}) {
  const { camera } = useThree();
  const {
    selectedBench,
    filteredBenches,
    topBenches,
    topBenchIds,
    zoomLevel,
    fetchRegionBenches,
    setCameraLatLng,
  } = useAppState();

  const lastFetchPos = useRef<THREE.Vector3>(new THREE.Vector3());
  const lastFetchZoom = useRef<number>(10);

  // Get rank for top benches
  const topBenchRanks = useMemo(() => {
    const ranks = new Map<string, number>();
    topBenches.forEach((bench, index) => {
      ranks.set(bench.id, index + 1);
    });
    return ranks;
  }, [topBenches]);

  // Determine if we should show clusters or individual markers
  const showClusters = zoomLevel > CLUSTER_ZOOM_THRESHOLD;

  // Cluster non-top benches when zoomed out
  const { clusters, singles } = useMemo(() => {
    if (!showClusters) {
      // When zoomed in, show all markers individually
      return { clusters: [], singles: filteredBenches };
    }
    return clusterBenches(filteredBenches, topBenchIds, CLUSTER_DISTANCE);
  }, [filteredBenches, topBenchIds, showClusters]);

  // Lazy load region data when zoomed in
  useFrame(() => {
    const dist = camera.position.length();

    // Update camera position in store (throttled)
    const cameraLatLng = getCameraLatLng(camera);
    setCameraLatLng(cameraLatLng);

    // Trigger region fetch when zoomed in close enough
    if (dist < LOCAL_BENCH_FADE_START) {
      const moved = camera.position.distanceTo(lastFetchPos.current);
      const zoomChanged = Math.abs(dist - lastFetchZoom.current) > 0.2;

      // Fetch if camera moved significantly or zoom changed
      if (moved > 0.1 || zoomChanged) {
        lastFetchPos.current.copy(camera.position);
        lastFetchZoom.current = dist;

        // Calculate bounding box based on zoom level
        const viewRadius = Math.max(5, (dist - 1) * 30); // degrees
        const { lat, lng } = cameraLatLng;

        fetchRegionBenches(
          lat - viewRadius,
          lat + viewRadius,
          lng - viewRadius,
          lng + viewRadius
        );
      }
    }
  });

  return (
    <group>
      {/* Render clusters when zoomed out */}
      {clusters.map((cluster, i) => (
        <ClusterMarker
          key={`cluster-${i}`}
          position={cluster.position}
          count={cluster.benches.length}
          benches={cluster.benches}
        />
      ))}

      {/* Render individual markers */}
      {singles.map((bench) => (
        <SingleMarker
          key={bench.id}
          bench={bench}
          isSelected={selectedBench?.id === bench.id}
          isTopBench={topBenchIds.has(bench.id)}
          rank={topBenchRanks.get(bench.id)}
        />
      ))}

      {pickingLocation && <GlobeClickHandler />}
      <PickedLocationMarker />
    </group>
  );
}

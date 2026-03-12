'use client';

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;
const ROAD_RADIUS = 1.0; // Exact radius - depth bias handles z-fighting

// Vertex shader for street lines
const STREET_VERTEX = /* glsl */ `
  void main() {
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Fragment shader with depth bias to avoid z-fighting
const STREET_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;

  void main() {
    gl_FragColor = vec4(uColor, uOpacity);
    gl_FragDepth = gl_FragCoord.z - 0.00001;
  }
`;

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

// Safety limit to prevent unexpected bills
const MAX_TILES_PER_SESSION = 500;

// Only show streets when zoomed this close
const VISIBILITY_START = 1.15;
const VISIBILITY_FULL = 1.08;

// Debounce: wait this many ms after camera stops before loading
const LOAD_DELAY_MS = 400;

function toGlobe(lat: number, lng: number): [number, number, number] {
  const phi = (90 - lat) * DEG2RAD;
  const theta = (lng + 180) * DEG2RAD;
  return [
    -(ROAD_RADIUS * Math.sin(phi) * Math.cos(theta)),
    ROAD_RADIUS * Math.cos(phi),
    ROAD_RADIUS * Math.sin(phi) * Math.sin(theta),
  ];
}

function getCameraLookAtLatLng(camera: THREE.Camera): { lat: number; lng: number } {
  const pos = camera.position.clone().normalize();
  const lat = 90 - Math.acos(pos.y) * RAD2DEG;
  const lng = Math.atan2(pos.z, -pos.x) * RAD2DEG - 180;
  return { lat, lng: ((lng + 540) % 360) - 180 };
}

function isPointFacingCamera(px: number, py: number, pz: number, cx: number, cy: number, cz: number): boolean {
  const len = Math.sqrt(px * px + py * py + pz * pz);
  const nx = px / len, ny = py / len, nz = pz / len;
  const dx = cx - px, dy = cy - py, dz = cz - pz;
  const dlen = Math.sqrt(dx * dx + dy * dy + dz * dz);
  return (nx * dx + ny * dy + nz * dz) / dlen > -0.1;
}

// Convert lat/lng to tile coordinates
function latLngToTile(lat: number, lng: number, zoom: number): { x: number; y: number } {
  const n = Math.pow(2, zoom);
  const x = Math.floor(((lng + 180) / 360) * n);
  const latRad = lat * DEG2RAD;
  const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n);
  return { x: Math.max(0, Math.min(n - 1, x)), y: Math.max(0, Math.min(n - 1, y)) };
}

// Convert tile pixel to lat/lng
function tilePixelToLatLng(tileX: number, tileY: number, zoom: number, px: number, py: number, extent: number = 4096): { lat: number; lng: number } {
  const n = Math.pow(2, zoom);
  const lng = ((tileX + px / extent) / n) * 360 - 180;
  const latRad = Math.atan(Math.sinh(Math.PI * (1 - 2 * (tileY + py / extent) / n)));
  const lat = latRad * RAD2DEG;
  return { lat, lng };
}

interface RoadSegment {
  p1: [number, number, number];
  p2: [number, number, number];
}

export function StreetTiles() {
  const { camera } = useThree();
  const [opacity, setOpacity] = useState(0);
  const [geometry, setGeometry] = useState<THREE.BufferGeometry | null>(null);
  const [tileCount, setTileCount] = useState(0);
  const [limitReached, setLimitReached] = useState(false);

  const segments = useRef<Map<string, RoadSegment[]>>(new Map());
  const loadedTiles = useRef<Set<string>>(new Set());
  const loadingTiles = useRef<Set<string>>(new Set());
  const VectorTile = useRef<any>(null);
  const Pbf = useRef<any>(null);
  const librariesLoaded = useRef(false);

  // Debounce state
  const lastCameraPos = useRef(new THREE.Vector3());
  const cameraStoppedAt = useRef<number | null>(null);
  const hasLoadedCurrentView = useRef(false);
  const lastLoadedArea = useRef<string>('');

  // Load the vector tile parsing libraries
  useEffect(() => {
    Promise.all([
      import('@mapbox/vector-tile'),
      import('pbf'),
    ]).then(([vt, pbf]) => {
      VectorTile.current = vt.VectorTile;
      Pbf.current = pbf.default;
      librariesLoaded.current = true;
      console.log('Mapbox libraries loaded');
    });
  }, []);

  // Rebuild geometry from current segments
  const rebuildGeometry = useCallback(() => {
    const verts: number[] = [];
    const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z;

    segments.current.forEach((segs) => {
      for (const seg of segs) {
        const [x1, y1, z1] = seg.p1;
        const [x2, y2, z2] = seg.p2;
        if (isPointFacingCamera(x1, y1, z1, cx, cy, cz) || isPointFacingCamera(x2, y2, z2, cx, cy, cz)) {
          verts.push(x1, y1, z1, x2, y2, z2);
        }
      }
    });

    if (verts.length > 0) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
      setGeometry(geo);
    } else {
      setGeometry(null);
    }
  }, [camera]);

  const loadTile = useCallback(async (x: number, y: number, zoom: number): Promise<boolean> => {
    if (!librariesLoaded.current || !MAPBOX_TOKEN) return false;
    if (limitReached) return false;

    const key = `${zoom}/${x}/${y}`;
    if (loadedTiles.current.has(key) || loadingTiles.current.has(key)) return false;

    loadingTiles.current.add(key);

    // Safety check
    if (tileCount >= MAX_TILES_PER_SESSION) {
      console.warn(`Tile limit reached (${MAX_TILES_PER_SESSION}). Stopping to prevent charges.`);
      setLimitReached(true);
      loadingTiles.current.delete(key);
      return false;
    }

    const url = `https://api.mapbox.com/v4/mapbox.mapbox-streets-v8/${zoom}/${x}/${y}.mvt?access_token=${MAPBOX_TOKEN}`;

    try {
      const response = await fetch(url);
      if (!response.ok) {
        loadingTiles.current.delete(key);
        return false;
      }

      setTileCount(prev => prev + 1);

      const buffer = await response.arrayBuffer();
      const tile = new VectorTile.current(new Pbf.current(buffer));

      const newSegments: RoadSegment[] = [];

      const roadLayer = tile.layers['road'];
      if (roadLayer) {
        for (let i = 0; i < roadLayer.length; i++) {
          const feature = roadLayer.feature(i);
          const geom = feature.loadGeometry();

          for (const ring of geom) {
            for (let j = 0; j < ring.length - 1; j++) {
              const p1 = ring[j];
              const p2 = ring[j + 1];

              const ll1 = tilePixelToLatLng(x, y, zoom, p1.x, p1.y);
              const ll2 = tilePixelToLatLng(x, y, zoom, p2.x, p2.y);

              newSegments.push({
                p1: toGlobe(ll1.lat, ll1.lng),
                p2: toGlobe(ll2.lat, ll2.lng),
              });
            }
          }
        }
      }

      loadedTiles.current.add(key);
      loadingTiles.current.delete(key);

      if (newSegments.length > 0) {
        segments.current.set(key, newSegments);
        console.log(`Tile ${key}: ${newSegments.length} roads (${tileCount + 1}/${MAX_TILES_PER_SESSION})`);
        return true;
      }
      return false;
    } catch (e) {
      loadingTiles.current.delete(key);
      return false;
    }
  }, [tileCount, limitReached]);

  // Load tiles for current view
  const loadVisibleTiles = useCallback(async (center: { lat: number; lng: number }, zoom: number) => {
    const centerTile = latLngToTile(center.lat, center.lng, zoom);
    const radius = 2; // 5x5 grid
    const n = Math.pow(2, zoom);

    const tilesToLoad: Array<{x: number, y: number}> = [];

    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const tx = ((centerTile.x + dx) % n + n) % n;
        const ty = centerTile.y + dy;
        if (ty >= 0 && ty < n) {
          const key = `${zoom}/${tx}/${ty}`;
          if (!loadedTiles.current.has(key) && !loadingTiles.current.has(key)) {
            tilesToLoad.push({ x: tx, y: ty });
          }
        }
      }
    }

    // Load tiles sequentially to avoid overwhelming the API
    let anyLoaded = false;
    for (const tile of tilesToLoad) {
      const loaded = await loadTile(tile.x, tile.y, zoom);
      if (loaded) anyLoaded = true;
    }

    if (anyLoaded) {
      rebuildGeometry();
    }

    console.log(`Loaded ${tilesToLoad.length} new tiles for area`);
  }, [loadTile, rebuildGeometry]);

  useFrame(() => {
    const dist = camera.position.length();

    // Opacity calculation
    const targetOpacity = dist < VISIBILITY_START
      ? Math.min(1, (VISIBILITY_START - dist) / (VISIBILITY_START - VISIBILITY_FULL))
      : 0;

    setOpacity(prev => {
      const diff = targetOpacity - prev;
      if (Math.abs(diff) < 0.01) return targetOpacity;
      // Fast fade-out (0.4), slower fade-in (0.15)
      const speed = diff < 0 ? 0.4 : 0.15;
      return prev + diff * speed;
    });

    // Don't process if not visible or limit reached
    if (dist > VISIBILITY_START || limitReached || !librariesLoaded.current) {
      // Reset debounce state when zoomed out
      cameraStoppedAt.current = null;
      hasLoadedCurrentView.current = false;
      return;
    }

    // Check if camera has moved
    const cameraMoved = camera.position.distanceTo(lastCameraPos.current) > 0.0001;
    lastCameraPos.current.copy(camera.position);

    if (cameraMoved) {
      // Camera is moving - reset debounce timer
      cameraStoppedAt.current = null;
      hasLoadedCurrentView.current = false;
    } else if (cameraStoppedAt.current === null) {
      // Camera just stopped - start debounce timer
      cameraStoppedAt.current = Date.now();
    }

    // Only load after camera has been still for LOAD_DELAY_MS
    if (cameraStoppedAt.current !== null && !hasLoadedCurrentView.current) {
      const stillTime = Date.now() - cameraStoppedAt.current;

      if (stillTime >= LOAD_DELAY_MS) {
        // Camera has been still long enough - load tiles
        const center = getCameraLookAtLatLng(camera);

        let zoom = 14;
        if (dist < 1.03) zoom = 16;
        else if (dist < 1.06) zoom = 15;
        else if (dist < 1.10) zoom = 14;
        else zoom = 13;

        const areaKey = `${center.lat.toFixed(2)},${center.lng.toFixed(2)},${zoom}`;

        // Only load if this is a new area
        if (areaKey !== lastLoadedArea.current) {
          lastLoadedArea.current = areaKey;
          hasLoadedCurrentView.current = true;
          console.log(`Camera stopped - loading tiles for ${center.lat.toFixed(2)}, ${center.lng.toFixed(2)} (zoom ${zoom})`);
          loadVisibleTiles(center, zoom);
        } else {
          hasLoadedCurrentView.current = true;
        }
      }
    }

    // Rebuild geometry for face culling (only if we have data)
    if (segments.current.size > 0 && opacity > 0.01) {
      rebuildGeometry();
    }
  });

  // Create material with depth bias
  const material = useMemo(() => {
    return new THREE.ShaderMaterial({
      vertexShader: STREET_VERTEX,
      fragmentShader: STREET_FRAGMENT,
      uniforms: {
        uColor: { value: new THREE.Color('#c9a86a') },
        uOpacity: { value: 0.6 },
      },
      transparent: true,
      depthWrite: false,
    });
  }, []);

  // Update material opacity based on fade state
  useEffect(() => {
    material.uniforms.uOpacity.value = opacity * 0.6;
  }, [opacity, material]);

  if (opacity < 0.01 || !geometry) return null;

  return (
    <lineSegments geometry={geometry} material={material} renderOrder={3} />
  );
}

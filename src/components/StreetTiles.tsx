'use client';

import { useRef, useCallback, useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import earcut from 'earcut';

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;
const TILE_RADIUS = 1.0; // Same as globe - depth bias handles z-fighting

// Vertex shader for street lines
const LINE_VERTEX = /* glsl */ `
  varying vec3 vWorldPos;

  void main() {
    vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Fragment shader with depth bias and backface culling
const LINE_FRAGMENT = /* glsl */ `
  varying vec3 vWorldPos;
  uniform vec3 uColor;
  uniform float uOpacity;

  void main() {
    vec3 normal = normalize(vWorldPos);
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    if (dot(normal, viewDir) < 0.05) discard;

    gl_FragColor = vec4(uColor, uOpacity);
    gl_FragDepth = gl_FragCoord.z - 0.00003; // Above detail layer
  }
`;

// Vertex shader for filled polygons (water, buildings)
const FILL_VERTEX = /* glsl */ `
  varying vec3 vWorldPos;
  varying vec3 vNormal;

  void main() {
    vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
    vNormal = normalize(vWorldPos);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Fragment shader for fills
const FILL_FRAGMENT = /* glsl */ `
  varying vec3 vWorldPos;
  varying vec3 vNormal;
  uniform vec3 uColor;
  uniform float uOpacity;

  void main() {
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    if (dot(vNormal, viewDir) < 0.0) discard;

    gl_FragColor = vec4(uColor, uOpacity);
    gl_FragDepth = gl_FragCoord.z - 0.000025; // Fills slightly behind lines
  }
`;

// Versatiles OSM tiles - free, no API key needed!
const TILE_URL = 'https://tiles.versatiles.org/tiles/osm';

// Only show street tiles when zoomed this close
const VISIBILITY_START = 1.15;
const VISIBILITY_FULL = 1.005;

// Debounce: wait this many ms after camera stops before loading
const LOAD_DELAY_MS = 150;

// Layer colors matching the warm earth palette
const COLORS = {
  roads: '#b89a6a',      // Warm tan for roads
  water: '#4a7a8a',      // Muted blue for water (matches lakes)
  buildings: '#8a7a6a',  // Muted brown for buildings
};

function toGlobe(lat: number, lng: number): [number, number, number] {
  const phi = (90 - lat) * DEG2RAD;
  const theta = (lng + 180) * DEG2RAD;
  return [
    -(TILE_RADIUS * Math.sin(phi) * Math.cos(theta)),
    TILE_RADIUS * Math.cos(phi),
    TILE_RADIUS * Math.sin(phi) * Math.sin(theta),
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

function latLngToTile(lat: number, lng: number, zoom: number): { x: number; y: number } {
  const n = Math.pow(2, zoom);
  const x = Math.floor(((lng + 180) / 360) * n);
  const latRad = lat * DEG2RAD;
  const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n);
  return { x: Math.max(0, Math.min(n - 1, x)), y: Math.max(0, Math.min(n - 1, y)) };
}

function tilePixelToLatLng(tileX: number, tileY: number, zoom: number, px: number, py: number, extent: number = 4096): { lat: number; lng: number } {
  const n = Math.pow(2, zoom);
  const lng = ((tileX + px / extent) / n) * 360 - 180;
  const latRad = Math.atan(Math.sinh(Math.PI * (1 - 2 * (tileY + py / extent) / n)));
  const lat = latRad * RAD2DEG;
  return { lat, lng };
}

// Triangulate polygon for filling
function triangulateRing(ring: Array<{x: number, y: number}>, tileX: number, tileY: number, zoom: number): number[] {
  if (ring.length < 3) return [];

  const flatCoords: number[] = [];
  for (const pt of ring) {
    flatCoords.push(pt.x, pt.y);
  }

  const indices = earcut(flatCoords, undefined, 2);
  const vertices: number[] = [];

  for (const idx of indices) {
    const pt = ring[idx];
    if (pt) {
      const ll = tilePixelToLatLng(tileX, tileY, zoom, pt.x, pt.y);
      const [x, y, z] = toGlobe(ll.lat, ll.lng);
      vertices.push(x, y, z);
    }
  }

  return vertices;
}

interface Segment {
  p1: [number, number, number];
  p2: [number, number, number];
}

interface TileData {
  roads: Segment[];
  waterLines: Segment[];
  waterFills: number[];
  buildings: number[];
}

function createLineMaterial(color: string): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: LINE_VERTEX,
    fragmentShader: LINE_FRAGMENT,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uOpacity: { value: 0 },
    },
    transparent: true,
    depthWrite: false,
  });
}

function createFillMaterial(color: string): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: FILL_VERTEX,
    fragmentShader: FILL_FRAGMENT,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uOpacity: { value: 0 },
    },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

export function StreetTiles() {
  const { camera } = useThree();

  const opacityRef = useRef(0);

  // Geometry refs for each layer
  const roadsGeometryRef = useRef<THREE.BufferGeometry | null>(null);
  const waterLinesGeometryRef = useRef<THREE.BufferGeometry | null>(null);
  const waterFillGeometryRef = useRef<THREE.BufferGeometry | null>(null);
  const buildingsGeometryRef = useRef<THREE.BufferGeometry | null>(null);

  // Mesh refs
  const roadsMeshRef = useRef<THREE.LineSegments>(null);
  const waterLinesMeshRef = useRef<THREE.LineSegments>(null);
  const waterFillMeshRef = useRef<THREE.Mesh>(null);
  const buildingsMeshRef = useRef<THREE.Mesh>(null);

  // Tile data storage
  const tileData = useRef<Map<string, TileData>>(new Map());
  const loadedTiles = useRef<Set<string>>(new Set());
  const loadingTiles = useRef<Set<string>>(new Set());

  // Vector tile libraries
  const VectorTile = useRef<any>(null);
  const Pbf = useRef<any>(null);
  const librariesLoaded = useRef(false);

  // Debounce state
  const lastCameraPos = useRef(new THREE.Vector3());
  const lastGeometryUpdatePos = useRef(new THREE.Vector3(0, 0, 100));
  const cameraStoppedAt = useRef<number | null>(null);
  const hasLoadedCurrentView = useRef(false);
  const lastLoadedArea = useRef<string>('');

  // Load vector tile parsing libraries
  useEffect(() => {
    Promise.all([
      import('@mapbox/vector-tile'),
      import('pbf'),
    ]).then(([vt, pbf]) => {
      VectorTile.current = vt.VectorTile;
      Pbf.current = pbf.default;
      librariesLoaded.current = true;
    });
  }, []);

  // Rebuild geometry from current tile data
  const rebuildGeometry = useCallback(() => {
    const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z;

    const roadVerts: number[] = [];
    const waterLineVerts: number[] = [];
    const waterFillVerts: number[] = [];
    const buildingVerts: number[] = [];

    tileData.current.forEach((data) => {
      // Roads
      for (const seg of data.roads) {
        const [x1, y1, z1] = seg.p1;
        const [x2, y2, z2] = seg.p2;
        if (isPointFacingCamera(x1, y1, z1, cx, cy, cz) || isPointFacingCamera(x2, y2, z2, cx, cy, cz)) {
          roadVerts.push(x1, y1, z1, x2, y2, z2);
        }
      }

      // Water lines (rivers, streams)
      for (const seg of data.waterLines) {
        const [x1, y1, z1] = seg.p1;
        const [x2, y2, z2] = seg.p2;
        if (isPointFacingCamera(x1, y1, z1, cx, cy, cz) || isPointFacingCamera(x2, y2, z2, cx, cy, cz)) {
          waterLineVerts.push(x1, y1, z1, x2, y2, z2);
        }
      }

      // Water fills - add all triangles (backface culling in shader)
      for (let i = 0; i < data.waterFills.length; i++) {
        waterFillVerts.push(data.waterFills[i]);
      }

      // Buildings - add all triangles
      for (let i = 0; i < data.buildings.length; i++) {
        buildingVerts.push(data.buildings[i]);
      }
    });

    // Update road geometry
    if (roadVerts.length > 0 && roadsGeometryRef.current) {
      const geo = roadsGeometryRef.current;
      const posAttr = geo.getAttribute('position') as THREE.BufferAttribute;
      if (posAttr && posAttr.array.length >= roadVerts.length) {
        (posAttr.array as Float32Array).set(roadVerts);
        posAttr.needsUpdate = true;
        geo.setDrawRange(0, roadVerts.length / 3);
      } else {
        geo.setAttribute('position', new THREE.Float32BufferAttribute(roadVerts, 3));
      }
      geo.computeBoundingSphere();
    }

    // Update water line geometry
    if (waterLineVerts.length > 0 && waterLinesGeometryRef.current) {
      const geo = waterLinesGeometryRef.current;
      const posAttr = geo.getAttribute('position') as THREE.BufferAttribute;
      if (posAttr && posAttr.array.length >= waterLineVerts.length) {
        (posAttr.array as Float32Array).set(waterLineVerts);
        posAttr.needsUpdate = true;
        geo.setDrawRange(0, waterLineVerts.length / 3);
      } else {
        geo.setAttribute('position', new THREE.Float32BufferAttribute(waterLineVerts, 3));
      }
      geo.computeBoundingSphere();
    }

    // Update water fill geometry
    if (waterFillVerts.length > 0 && waterFillGeometryRef.current) {
      const geo = waterFillGeometryRef.current;
      geo.setAttribute('position', new THREE.Float32BufferAttribute(waterFillVerts, 3));
      geo.computeBoundingSphere();
    }

    // Update building geometry
    if (buildingVerts.length > 0 && buildingsGeometryRef.current) {
      const geo = buildingsGeometryRef.current;
      geo.setAttribute('position', new THREE.Float32BufferAttribute(buildingVerts, 3));
      geo.computeBoundingSphere();
    }
  }, [camera]);

  // Load a single tile
  const loadTile = useCallback(async (x: number, y: number, zoom: number): Promise<boolean> => {
    if (!librariesLoaded.current) return false;

    const key = `${zoom}/${x}/${y}`;
    if (loadedTiles.current.has(key) || loadingTiles.current.has(key)) return false;

    loadingTiles.current.add(key);

    const url = `${TILE_URL}/${zoom}/${x}/${y}`;

    try {
      const response = await fetch(url);
      if (!response.ok) {
        loadingTiles.current.delete(key);
        return false;
      }

      const buffer = await response.arrayBuffer();
      const tile = new VectorTile.current(new Pbf.current(buffer));


      const data: TileData = {
        roads: [],
        waterLines: [],
        waterFills: [],
        buildings: [],
      };

      // Process streets layer
      const streetsLayer = tile.layers['streets'];
      if (streetsLayer) {
        for (let i = 0; i < streetsLayer.length; i++) {
          const feature = streetsLayer.feature(i);
          if (feature.type !== 2) continue; // Only line features
          const geom = feature.loadGeometry();

          for (const ring of geom) {
            for (let j = 0; j < ring.length - 1; j++) {
              const p1 = ring[j];
              const p2 = ring[j + 1];
              const ll1 = tilePixelToLatLng(x, y, zoom, p1.x, p1.y);
              const ll2 = tilePixelToLatLng(x, y, zoom, p2.x, p2.y);
              data.roads.push({
                p1: toGlobe(ll1.lat, ll1.lng),
                p2: toGlobe(ll2.lat, ll2.lng),
              });
            }
          }
        }
      }

      // Process water polygon fills
      const waterPolyLayer = tile.layers['water_polygons'];
      if (waterPolyLayer) {
        for (let i = 0; i < waterPolyLayer.length; i++) {
          const feature = waterPolyLayer.feature(i);
          if (feature.type === 3) {
            const geom = feature.loadGeometry();
            for (const ring of geom) {
              const triangles = triangulateRing(ring, x, y, zoom);
              for (let t = 0; t < triangles.length; t++) {
                data.waterFills.push(triangles[t]);
              }
            }
          }
        }
      }

      // Process water lines (rivers, streams)
      const waterLinesLayer = tile.layers['water_lines'];
      if (waterLinesLayer) {
        for (let i = 0; i < waterLinesLayer.length; i++) {
          const feature = waterLinesLayer.feature(i);
          if (feature.type === 2) {
            const geom = feature.loadGeometry();
            for (const ring of geom) {
              for (let j = 0; j < ring.length - 1; j++) {
                const p1 = ring[j];
                const p2 = ring[j + 1];
                const ll1 = tilePixelToLatLng(x, y, zoom, p1.x, p1.y);
                const ll2 = tilePixelToLatLng(x, y, zoom, p2.x, p2.y);
                data.waterLines.push({
                  p1: toGlobe(ll1.lat, ll1.lng),
                  p2: toGlobe(ll2.lat, ll2.lng),
                });
              }
            }
          }
        }
      }

      // Try multiple building layer names
      const buildingLayerNames = ['buildings', 'building'];
      for (const layerName of buildingLayerNames) {
        const buildingLayer = tile.layers[layerName];
        if (buildingLayer) {
          for (let i = 0; i < buildingLayer.length; i++) {
            const feature = buildingLayer.feature(i);
            const geomType = feature.type;

            if (geomType === 3) {
              const geom = feature.loadGeometry();
              for (const ring of geom) {
                const triangles = triangulateRing(ring, x, y, zoom);
                for (let t = 0; t < triangles.length; t++) {
                  data.buildings.push(triangles[t]);
                }
              }
            }
          }
        }
      }

      loadedTiles.current.add(key);
      loadingTiles.current.delete(key);

      const totalFeatures = data.roads.length + data.waterLines.length +
        (data.waterFills.length / 9) + (data.buildings.length / 9);

      // Always store data and log (for debugging)
      tileData.current.set(key, data);


      return totalFeatures > 0;
    } catch (e) {
      loadingTiles.current.delete(key);
      console.warn(`Failed to load tile ${key}:`, e);
      return false;
    }
  }, []);

  // Load tiles for current view
  const loadVisibleTiles = useCallback(async (center: { lat: number; lng: number }, zoom: number) => {
    const centerTile = latLngToTile(center.lat, center.lng, zoom);
    const radius = 1; // 3x3 grid = 9 tiles (was 2 = 25 tiles)
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

    // Load tiles in parallel (Versatiles can handle it)
    const results = await Promise.all(
      tilesToLoad.map(tile => loadTile(tile.x, tile.y, zoom))
    );

    if (results.some(r => r)) {
      rebuildGeometry();
    }
  }, [loadTile, rebuildGeometry]);

  useFrame(() => {
    const dist = camera.position.length();

    // Opacity calculation
    const targetOpacity = dist < VISIBILITY_START
      ? Math.min(1, (VISIBILITY_START - dist) / (VISIBILITY_START - VISIBILITY_FULL))
      : 0;

    const diff = targetOpacity - opacityRef.current;
    if (Math.abs(diff) >= 0.001) {
      const speed = diff < 0 ? 0.4 : 0.15;
      opacityRef.current += diff * speed;
    } else {
      opacityRef.current = targetOpacity;
    }

    // Update material opacities
    const hasData = tileData.current.size > 0;

    if (roadsMeshRef.current) {
      const mat = roadsMeshRef.current.material as THREE.ShaderMaterial;
      mat.uniforms.uOpacity.value = opacityRef.current * 0.7;
      roadsMeshRef.current.visible = opacityRef.current > 0.01 && hasData;
    }
    if (waterLinesMeshRef.current) {
      const mat = waterLinesMeshRef.current.material as THREE.ShaderMaterial;
      mat.uniforms.uOpacity.value = opacityRef.current * 0.6;
      waterLinesMeshRef.current.visible = opacityRef.current > 0.01 && hasData;
    }
    if (waterFillMeshRef.current) {
      const mat = waterFillMeshRef.current.material as THREE.ShaderMaterial;
      mat.uniforms.uOpacity.value = opacityRef.current * 0.5;
      waterFillMeshRef.current.visible = opacityRef.current > 0.01 && hasData;
    }
    if (buildingsMeshRef.current) {
      const mat = buildingsMeshRef.current.material as THREE.ShaderMaterial;
      mat.uniforms.uOpacity.value = opacityRef.current * 0.35;
      buildingsMeshRef.current.visible = opacityRef.current > 0.01 && hasData;
    }

    // Don't process if not visible
    if (dist > VISIBILITY_START || !librariesLoaded.current) {
      cameraStoppedAt.current = null;
      hasLoadedCurrentView.current = false;
      return;
    }

    // Check if camera has moved
    const cameraMoved = camera.position.distanceTo(lastCameraPos.current) > 0.0001;
    lastCameraPos.current.copy(camera.position);

    if (cameraMoved) {
      cameraStoppedAt.current = null;
      hasLoadedCurrentView.current = false;
    } else if (cameraStoppedAt.current === null) {
      cameraStoppedAt.current = Date.now();
    }

    // Load after camera stops
    if (cameraStoppedAt.current !== null && !hasLoadedCurrentView.current) {
      const stillTime = Date.now() - cameraStoppedAt.current;

      if (stillTime >= LOAD_DELAY_MS) {
        const center = getCameraLookAtLatLng(camera);

        // Adaptive zoom based on camera distance
        let zoom: number;
        if (dist < 1.02) zoom = 14;       // Very close - full detail
        else if (dist < 1.05) zoom = 13;  // Close
        else if (dist < 1.10) zoom = 12;  // Medium
        else zoom = 11;                    // Far - overview

        const areaKey = `${center.lat.toFixed(2)},${center.lng.toFixed(2)},${zoom}`;

        if (areaKey !== lastLoadedArea.current) {
          lastLoadedArea.current = areaKey;
          hasLoadedCurrentView.current = true;
          loadVisibleTiles(center, zoom);
        } else {
          hasLoadedCurrentView.current = true;
        }
      }
    }

    // Rebuild geometry when camera moves significantly
    if (tileData.current.size > 0 && opacityRef.current > 0.01) {
      const moved = camera.position.distanceTo(lastGeometryUpdatePos.current);
      if (moved > 0.01) {
        lastGeometryUpdatePos.current.copy(camera.position);
        rebuildGeometry();
      }
    }
  });

  // Create materials
  const roadsMaterial = useMemo(() => createLineMaterial(COLORS.roads), []);
  const waterLinesMaterial = useMemo(() => createLineMaterial(COLORS.water), []);
  const waterFillMaterial = useMemo(() => createFillMaterial(COLORS.water), []);
  const buildingsMaterial = useMemo(() => createFillMaterial(COLORS.buildings), []);

  // Create placeholder geometries
  const placeholderGeometries = useMemo(() => {
    const createPlaceholder = () => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute([], 3));
      return geo;
    };

    const roads = createPlaceholder();
    const waterLines = createPlaceholder();
    const waterFill = createPlaceholder();
    const buildings = createPlaceholder();

    roadsGeometryRef.current = roads;
    waterLinesGeometryRef.current = waterLines;
    waterFillGeometryRef.current = waterFill;
    buildingsGeometryRef.current = buildings;

    return { roads, waterLines, waterFill, buildings };
  }, []);

  return (
    <group>
      {/* Water fills (behind everything) */}
      <mesh
        ref={waterFillMeshRef}
        geometry={placeholderGeometries.waterFill}
        material={waterFillMaterial}
        renderOrder={3}
        visible={false}
      />
      {/* Building fills */}
      <mesh
        ref={buildingsMeshRef}
        geometry={placeholderGeometries.buildings}
        material={buildingsMaterial}
        renderOrder={4}
        visible={false}
      />
      {/* Water lines (rivers) */}
      <lineSegments
        ref={waterLinesMeshRef}
        geometry={placeholderGeometries.waterLines}
        material={waterLinesMaterial}
        renderOrder={5}
        visible={false}
      />
      {/* Roads (on top) */}
      <lineSegments
        ref={roadsMeshRef}
        geometry={placeholderGeometries.roads}
        material={roadsMaterial}
        renderOrder={6}
        visible={false}
      />
    </group>
  );
}

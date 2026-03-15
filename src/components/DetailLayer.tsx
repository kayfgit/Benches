'use client';

import { useEffect, useRef, useCallback, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useAppState } from '@/lib/store';

const DEG2RAD = Math.PI / 180;
const RADIUS = 1.002; // Slightly above land layer (1.001) to render on top

// Vertex shader for detail lines - passes world position for backface culling
const DETAIL_VERTEX = /* glsl */ `
  varying vec3 vWorldPos;

  void main() {
    vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Fragment shader with depth bias and backface culling
const DETAIL_FRAGMENT = /* glsl */ `
  varying vec3 vWorldPos;
  uniform vec3 uColor;
  uniform float uOpacity;

  void main() {
    // Normal is normalized position (sphere centered at origin)
    vec3 normal = normalize(vWorldPos);
    vec3 viewDir = normalize(cameraPosition - vWorldPos);

    // Discard back-facing fragments
    if (dot(normal, viewDir) < 0.05) discard;

    gl_FragColor = vec4(uColor, uOpacity);
    gl_FragDepth = gl_FragCoord.z - 0.00001;
  }
`;

// Create a shader material with depth bias
function createDepthBiasMaterial(color: string, opacity: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: DETAIL_VERTEX,
    fragmentShader: DETAIL_FRAGMENT,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uOpacity: { value: opacity },
    },
    transparent: true,
    depthWrite: false,
  });
}

// Natural Earth data URLs - 50m scale for performance mode, 10m for quality mode
// Lakes removed - now handled by WaterLayer with filled polygons
const DATA_URLS_PERFORMANCE = {
  states: 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_1_states_provinces_lines.geojson',
  rivers: 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_rivers_lake_centerlines.geojson',
};

// Quality mode uses 10m resolution (original high detail) with all layers
const DATA_URLS_QUALITY = {
  states: 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_1_states_provinces_lines.geojson',
  urban: 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_urban_areas.geojson',
  rivers: 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_rivers_lake_centerlines.geojson',
  roads: 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_roads.geojson',
};

function toGlobe(lat: number, lon: number): [number, number, number] {
  const phi = (90 - lat) * DEG2RAD;
  const theta = (lon + 180) * DEG2RAD;
  return [
    -(RADIUS * Math.sin(phi) * Math.cos(theta)),
    RADIUS * Math.cos(phi),
    RADIUS * Math.sin(phi) * Math.sin(theta),
  ];
}

// Check if a point is visible from camera
function isPointFacingCamera(px: number, py: number, pz: number, cx: number, cy: number, cz: number): boolean {
  // Normal is just the normalized position (sphere centered at origin)
  const len = Math.sqrt(px * px + py * py + pz * pz);
  const nx = px / len, ny = py / len, nz = pz / len;
  // Direction to camera
  const dx = cx - px, dy = cy - py, dz = cz - pz;
  const dlen = Math.sqrt(dx * dx + dy * dy + dz * dz);
  // Dot product
  return (nx * dx + ny * dy + nz * dz) / dlen > -0.1;
}

interface RawSegment {
  p1: [number, number, number];
  p2: [number, number, number];
}

interface LayerSegments {
  [key: string]: RawSegment[];
}

export function DetailLayer() {
  const { camera } = useThree();
  const { performanceMode } = useAppState();

  // Use refs instead of state to avoid re-renders in useFrame
  // Separate opacity refs for OSM-style zoom-based filtering
  const statesOpacityRef = useRef(0);
  const riversOpacityRef = useRef(0);
  const roadsOpacityRef = useRef(0);
  const urbanOpacityRef = useRef(0);
  const geometriesRef = useRef<{ [key: string]: THREE.BufferGeometry }>({});

  // Refs for mesh objects to update visibility/material directly
  const statesMeshRef = useRef<THREE.LineSegments>(null);
  const urbanMeshRef = useRef<THREE.LineSegments>(null);
  const riversMeshRef = useRef<THREE.LineSegments>(null);
  const roadsMeshRef = useRef<THREE.LineSegments>(null);

  const segmentsRef = useRef<LayerSegments>({});
  const lastUpdatePos = useRef(new THREE.Vector3(0, 0, 100));
  const dataLoaded = useRef(false);
  const lastPerformanceMode = useRef(performanceMode);

  // Load and process all data sources - respects performance mode
  useEffect(() => {
    // Reload if performance mode changed
    if (lastPerformanceMode.current !== performanceMode) {
      lastPerformanceMode.current = performanceMode;
      dataLoaded.current = false;
      segmentsRef.current = {};
    }

    const loadData = async () => {
      try {
        const urls = performanceMode ? DATA_URLS_PERFORMANCE : DATA_URLS_QUALITY;

        const fetches = [
          fetch(urls.states).then(r => r.json()).catch(() => null),
          fetch(urls.rivers).then(r => r.json()).catch(() => null),
        ];

        // Only fetch urban and roads in quality mode
        if (!performanceMode) {
          const qualityUrls = urls as typeof DATA_URLS_QUALITY;
          fetches.push(
            fetch(qualityUrls.urban).then(r => r.json()).catch(() => null),
            fetch(qualityUrls.roads).then(r => r.json()).catch(() => null),
          );
        }

        const results = await Promise.all(fetches);
        const [states, rivers, urban, roads] = results;

        // Extract segments from GeoJSON
        const extractSegments = (geoJson: any): RawSegment[] => {
          const segments: RawSegment[] = [];
          if (!geoJson?.features) return segments;

          const processCoords = (coords: number[][]) => {
            for (let i = 0; i < coords.length - 1; i++) {
              const [lon1, lat1] = coords[i];
              const [lon2, lat2] = coords[i + 1];
              if (Math.abs(lon2 - lon1) > 170) continue;
              segments.push({
                p1: toGlobe(lat1, lon1),
                p2: toGlobe(lat2, lon2),
              });
            }
          };

          const processGeometry = (geom: any) => {
            if (!geom) return;
            if (geom.type === 'LineString') {
              processCoords(geom.coordinates);
            } else if (geom.type === 'MultiLineString') {
              geom.coordinates.forEach((line: number[][]) => processCoords(line));
            } else if (geom.type === 'Polygon') {
              geom.coordinates.forEach((ring: number[][]) => processCoords(ring));
            } else if (geom.type === 'MultiPolygon') {
              geom.coordinates.forEach((poly: number[][][]) =>
                poly.forEach((ring: number[][]) => processCoords(ring))
              );
            }
          };

          for (const feature of geoJson.features) {
            processGeometry(feature.geometry);
          }
          return segments;
        };

        segmentsRef.current = {
          states: extractSegments(states),
          rivers: extractSegments(rivers),
          ...(performanceMode ? {} : {
            urban: extractSegments(urban),
            roads: extractSegments(roads),
          }),
        };

        dataLoaded.current = true;
      } catch (e) {
        console.error('Failed to load detail layer data:', e);
      }
    };
    loadData();
  }, [performanceMode]);

  // Build visible geometry - only include segments facing the camera
  // Reuses geometry objects to avoid GC pressure
  const updateGeometry = useCallback((cx: number, cy: number, cz: number) => {
    for (const [key, segments] of Object.entries(segmentsRef.current)) {
      const verts: number[] = [];

      for (const seg of segments) {
        const [x1, y1, z1] = seg.p1;
        const [x2, y2, z2] = seg.p2;

        // Include segment if either endpoint faces camera
        if (
          isPointFacingCamera(x1, y1, z1, cx, cy, cz) ||
          isPointFacingCamera(x2, y2, z2, cx, cy, cz)
        ) {
          verts.push(x1, y1, z1, x2, y2, z2);
        }
      }

      if (verts.length > 0) {
        // Reuse existing geometry or create new one
        let geo = geometriesRef.current[key];
        if (!geo) {
          geo = new THREE.BufferGeometry();
          geometriesRef.current[key] = geo;
        }

        // Update position attribute in place when possible
        const posAttr = geo.getAttribute('position') as THREE.BufferAttribute;
        if (posAttr && posAttr.array.length >= verts.length) {
          (posAttr.array as Float32Array).set(verts);
          posAttr.needsUpdate = true;
          geo.setDrawRange(0, verts.length / 3);
        } else {
          geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
        }
        geo.computeBoundingSphere();
      }
    }
  }, []);

  useFrame(() => {
    const dist = camera.position.length();

    // OSM-style zoom-based layer filtering
    // Each layer fades in at different zoom levels (distances)

    // States/provinces: visible at medium zoom (dist < 2.5, fully visible at 2.0)
    const targetStates = dist < 2.5 ? Math.min(1, (2.5 - dist) / 0.5) : 0;
    const statesDiff = targetStates - statesOpacityRef.current;
    if (Math.abs(statesDiff) >= 0.001) {
      statesOpacityRef.current += statesDiff * (statesDiff < 0 ? 0.4 : 0.15);
    } else {
      statesOpacityRef.current = targetStates;
    }

    // Rivers: visible at medium-close zoom (dist < 2.2, fully visible at 1.8)
    const targetRivers = dist < 2.2 ? Math.min(1, (2.2 - dist) / 0.4) : 0;
    const riversDiff = targetRivers - riversOpacityRef.current;
    if (Math.abs(riversDiff) >= 0.001) {
      riversOpacityRef.current += riversDiff * (riversDiff < 0 ? 0.4 : 0.15);
    } else {
      riversOpacityRef.current = targetRivers;
    }

    // Roads: visible at close zoom (dist < 1.8, fully visible at 1.5)
    const targetRoads = dist < 1.8 ? Math.min(1, (1.8 - dist) / 0.3) : 0;
    const roadsDiff = targetRoads - roadsOpacityRef.current;
    if (Math.abs(roadsDiff) >= 0.001) {
      roadsOpacityRef.current += roadsDiff * (roadsDiff < 0 ? 0.4 : 0.15);
    } else {
      roadsOpacityRef.current = targetRoads;
    }

    // Urban areas: visible at very close zoom (dist < 1.5, fully visible at 1.2)
    const targetUrban = dist < 1.5 ? Math.min(1, (1.5 - dist) / 0.3) : 0;
    const urbanDiff = targetUrban - urbanOpacityRef.current;
    if (Math.abs(urbanDiff) >= 0.001) {
      urbanOpacityRef.current += urbanDiff * (urbanDiff < 0 ? 0.4 : 0.15);
    } else {
      urbanOpacityRef.current = targetUrban;
    }

    // Update material uniforms directly (no React re-render)
    if (statesMeshRef.current) {
      const mat = statesMeshRef.current.material as THREE.ShaderMaterial;
      mat.uniforms.uOpacity.value = statesOpacityRef.current * 0.25;
      statesMeshRef.current.visible = statesOpacityRef.current > 0.01 && !!geometriesRef.current.states;
    }
    if (riversMeshRef.current) {
      const mat = riversMeshRef.current.material as THREE.ShaderMaterial;
      mat.uniforms.uOpacity.value = riversOpacityRef.current * 0.5;
      riversMeshRef.current.visible = riversOpacityRef.current > 0.01 && !!geometriesRef.current.rivers;
    }
    if (roadsMeshRef.current) {
      const mat = roadsMeshRef.current.material as THREE.ShaderMaterial;
      mat.uniforms.uOpacity.value = roadsOpacityRef.current * 0.4;
      roadsMeshRef.current.visible = !performanceMode && roadsOpacityRef.current > 0.01 && !!geometriesRef.current.roads;
    }
    if (urbanMeshRef.current) {
      const mat = urbanMeshRef.current.material as THREE.ShaderMaterial;
      mat.uniforms.uOpacity.value = urbanOpacityRef.current * 0.4;
      urbanMeshRef.current.visible = !performanceMode && urbanOpacityRef.current > 0.01 && !!geometriesRef.current.urban;
    }

    // Update geometry when camera moves significantly (throttled, adaptive threshold)
    const anyVisible = statesOpacityRef.current > 0.01 || riversOpacityRef.current > 0.01 ||
                       roadsOpacityRef.current > 0.01 || urbanOpacityRef.current > 0.01;
    if (dataLoaded.current && anyVisible) {
      const moved = camera.position.distanceTo(lastUpdatePos.current);
      // Smaller threshold when zoomed in close
      const updateThreshold = Math.max(0.02, dist * 0.08);
      if (moved > updateThreshold) {
        lastUpdatePos.current.copy(camera.position);
        updateGeometry(camera.position.x, camera.position.y, camera.position.z);
      }
    }
  });

  // Create materials with depth bias
  // Colors follow warm earth-tone theme with water as muted blue
  const statesMaterial = useMemo(() => createDepthBiasMaterial('#a89880', 0), []);
  const urbanMaterial = useMemo(() => createDepthBiasMaterial('#d4c4a8', 0), []);
  const riversMaterial = useMemo(() => createDepthBiasMaterial('#6a9fb5', 0), []); // Muted blue for rivers
  const roadsMaterial = useMemo(() => createDepthBiasMaterial('#c9a86a', 0), []);

  // Create placeholder geometries for each layer
  const placeholderGeometries = useMemo(() => {
    const geos: { [key: string]: THREE.BufferGeometry } = {};
    for (const key of ['states', 'urban', 'rivers', 'roads']) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute([], 3));
      geos[key] = geo;
      geometriesRef.current[key] = geo;
    }
    return geos;
  }, []);

  // Always render but control visibility via refs - avoids mount/unmount overhead
  // Render order follows OSM-style: rivers (2), roads (2.5), states (3)
  return (
    <group>
      <lineSegments
        ref={riversMeshRef}
        geometry={placeholderGeometries.rivers}
        material={riversMaterial}
        renderOrder={2}
        visible={false}
      />
      <lineSegments
        ref={urbanMeshRef}
        geometry={placeholderGeometries.urban}
        material={urbanMaterial}
        renderOrder={2.5}
        visible={false}
      />
      <lineSegments
        ref={roadsMeshRef}
        geometry={placeholderGeometries.roads}
        material={roadsMaterial}
        renderOrder={2.5}
        visible={false}
      />
      <lineSegments
        ref={statesMeshRef}
        geometry={placeholderGeometries.states}
        material={statesMaterial}
        renderOrder={3}
        visible={false}
      />
    </group>
  );
}

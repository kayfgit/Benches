'use client';

import { useEffect, useRef, useCallback, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

const DEG2RAD = Math.PI / 180;
const RADIUS = 1.0; // Exact radius - depth bias handles z-fighting

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

// Natural Earth data URLs
const DATA_URLS = {
  states: 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_1_states_provinces_lines.geojson',
  urban: 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_urban_areas.geojson',
  lakes: 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_lakes.geojson',
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

  // Use refs instead of state to avoid re-renders in useFrame
  const opacityRef = useRef(0);
  const statesOpacityRef = useRef(0);
  const geometriesRef = useRef<{ [key: string]: THREE.BufferGeometry }>({});

  // Refs for mesh objects to update visibility/material directly
  const statesMeshRef = useRef<THREE.LineSegments>(null);
  const urbanMeshRef = useRef<THREE.LineSegments>(null);
  const lakesMeshRef = useRef<THREE.LineSegments>(null);
  const riversMeshRef = useRef<THREE.LineSegments>(null);
  const roadsMeshRef = useRef<THREE.LineSegments>(null);

  const segmentsRef = useRef<LayerSegments>({});
  const lastUpdatePos = useRef(new THREE.Vector3(0, 0, 100));
  const dataLoaded = useRef(false);

  // Load and process all data sources
  useEffect(() => {
    const loadData = async () => {
      try {
        const results = await Promise.all([
          fetch(DATA_URLS.states).then(r => r.json()).catch(() => null),
          fetch(DATA_URLS.urban).then(r => r.json()).catch(() => null),
          fetch(DATA_URLS.lakes).then(r => r.json()).catch(() => null),
          fetch(DATA_URLS.rivers).then(r => r.json()).catch(() => null),
          fetch(DATA_URLS.roads).then(r => r.json()).catch(() => null),
        ]);

        const [states, urban, lakes, rivers, roads] = results;

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
          urban: extractSegments(urban),
          lakes: extractSegments(lakes),
          rivers: extractSegments(rivers),
          roads: extractSegments(roads),
        };

        dataLoaded.current = true;
      } catch (e) {
        console.error('Failed to load detail layer data:', e);
      }
    };
    loadData();
  }, []);

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

    // States layer - start at 2.1, fully visible at 1.8
    const targetStatesOpacity = dist < 2.1 ? Math.min(1, (2.1 - dist) / 0.3) : 0;
    const statesDiff = targetStatesOpacity - statesOpacityRef.current;
    if (Math.abs(statesDiff) >= 0.001) {
      const speed = statesDiff < 0 ? 0.4 : 0.15;
      statesOpacityRef.current += statesDiff * speed;
    } else {
      statesOpacityRef.current = targetStatesOpacity;
    }

    // Detail layers (urban, lakes, rivers, roads) - start at 1.6, fully visible at 1.3
    const targetOpacity = dist < 1.6 ? Math.min(1, (1.6 - dist) / 0.3) : 0;
    const diff = targetOpacity - opacityRef.current;
    if (Math.abs(diff) >= 0.001) {
      const speed = diff < 0 ? 0.4 : 0.15;
      opacityRef.current += diff * speed;
    } else {
      opacityRef.current = targetOpacity;
    }

    // Update material uniforms directly (no React re-render)
    if (statesMeshRef.current) {
      const mat = statesMeshRef.current.material as THREE.ShaderMaterial;
      mat.uniforms.uOpacity.value = statesOpacityRef.current * 0.3;
      statesMeshRef.current.visible = statesOpacityRef.current > 0.01 && !!geometriesRef.current.states;
    }
    if (urbanMeshRef.current) {
      const mat = urbanMeshRef.current.material as THREE.ShaderMaterial;
      mat.uniforms.uOpacity.value = opacityRef.current * 0.45;
      urbanMeshRef.current.visible = opacityRef.current > 0.01 && !!geometriesRef.current.urban;
    }
    if (lakesMeshRef.current) {
      const mat = lakesMeshRef.current.material as THREE.ShaderMaterial;
      mat.uniforms.uOpacity.value = opacityRef.current * 0.55;
      lakesMeshRef.current.visible = opacityRef.current > 0.01 && !!geometriesRef.current.lakes;
    }
    if (riversMeshRef.current) {
      const mat = riversMeshRef.current.material as THREE.ShaderMaterial;
      mat.uniforms.uOpacity.value = opacityRef.current * 0.45;
      riversMeshRef.current.visible = opacityRef.current > 0.01 && !!geometriesRef.current.rivers;
    }
    if (roadsMeshRef.current) {
      const mat = roadsMeshRef.current.material as THREE.ShaderMaterial;
      mat.uniforms.uOpacity.value = opacityRef.current * 0.4;
      roadsMeshRef.current.visible = opacityRef.current > 0.01 && !!geometriesRef.current.roads;
    }

    // Update geometry when camera moves significantly (throttled, adaptive threshold)
    const anyVisible = opacityRef.current > 0.01 || statesOpacityRef.current > 0.01;
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
  const statesMaterial = useMemo(() => createDepthBiasMaterial('#a89880', 0), []);
  const urbanMaterial = useMemo(() => createDepthBiasMaterial('#d4c4a8', 0), []);
  const lakesMaterial = useMemo(() => createDepthBiasMaterial('#6a9fb5', 0), []);
  const riversMaterial = useMemo(() => createDepthBiasMaterial('#7ab0c9', 0), []);
  const roadsMaterial = useMemo(() => createDepthBiasMaterial('#c9a86a', 0), []);

  // Create placeholder geometries for each layer
  const placeholderGeometries = useMemo(() => {
    const geos: { [key: string]: THREE.BufferGeometry } = {};
    for (const key of ['states', 'urban', 'lakes', 'rivers', 'roads']) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute([], 3));
      geos[key] = geo;
      geometriesRef.current[key] = geo;
    }
    return geos;
  }, []);

  // Always render but control visibility via refs - avoids mount/unmount overhead
  return (
    <group>
      <lineSegments
        ref={statesMeshRef}
        geometry={placeholderGeometries.states}
        material={statesMaterial}
        renderOrder={2}
        visible={false}
      />
      <lineSegments
        ref={urbanMeshRef}
        geometry={placeholderGeometries.urban}
        material={urbanMaterial}
        renderOrder={2}
        visible={false}
      />
      <lineSegments
        ref={lakesMeshRef}
        geometry={placeholderGeometries.lakes}
        material={lakesMaterial}
        renderOrder={2}
        visible={false}
      />
      <lineSegments
        ref={riversMeshRef}
        geometry={placeholderGeometries.rivers}
        material={riversMaterial}
        renderOrder={2}
        visible={false}
      />
      <lineSegments
        ref={roadsMeshRef}
        geometry={placeholderGeometries.roads}
        material={roadsMaterial}
        renderOrder={2}
        visible={false}
      />
    </group>
  );
}

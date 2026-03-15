'use client';

import { useEffect, useRef, useCallback, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import earcut from 'earcut';
import { useAppState } from '@/lib/store';

const DEG2RAD = Math.PI / 180;
const RADIUS = 1.001; // Slightly above globe surface to prevent z-fighting

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

// Vertex shader for filled polygons (lakes)
const FILL_VERTEX = /* glsl */ `
  varying vec3 vWorldPos;
  varying vec3 vNormal;

  void main() {
    vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
    vNormal = normalize(vWorldPos); // Normal points outward from globe center
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Fragment shader for filled polygons with backface culling
const FILL_FRAGMENT = /* glsl */ `
  varying vec3 vWorldPos;
  varying vec3 vNormal;
  uniform vec3 uColor;
  uniform float uOpacity;

  void main() {
    vec3 viewDir = normalize(cameraPosition - vWorldPos);

    // Discard back-facing fragments
    if (dot(vNormal, viewDir) < 0.0) discard;

    gl_FragColor = vec4(uColor, uOpacity);
    gl_FragDepth = gl_FragCoord.z - 0.00002; // Slightly more bias for fills
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

// Create a shader material for filled polygons
function createFillMaterial(color: string, opacity: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: FILL_VERTEX,
    fragmentShader: FILL_FRAGMENT,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uOpacity: { value: opacity },
    },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

// Natural Earth data URLs - 50m scale for performance mode, 10m for quality mode
const DATA_URLS_PERFORMANCE = {
  states: 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_1_states_provinces_lines.geojson',
  lakes: 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_lakes.geojson',
  rivers: 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_rivers_lake_centerlines.geojson',
};

// Quality mode uses 10m resolution (original high detail) with all layers
const DATA_URLS_QUALITY = {
  states: 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_1_states_provinces_lines.geojson',
  urban: 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_urban_areas.geojson',
  lakes: 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_lakes.geojson',
  rivers: 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_rivers_lake_centerlines.geojson',
  roads: 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_roads.geojson',
};

function toGlobe(lat: number, lon: number, radius: number = RADIUS): [number, number, number] {
  const phi = (90 - lat) * DEG2RAD;
  const theta = (lon + 180) * DEG2RAD;
  return [
    -(radius * Math.sin(phi) * Math.cos(theta)),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  ];
}

// Triangulate a polygon ring and project onto globe
// Returns array of triangle vertices [x1,y1,z1, x2,y2,z2, x3,y3,z3, ...]
function triangulatePolygonOnGlobe(
  outerRing: number[][],
  holes: number[][][] = []
): number[] {
  const vertices: number[] = [];

  // Skip if ring is too small
  if (outerRing.length < 3) return vertices;

  // Check for antimeridian crossing - skip polygons that span it
  for (let i = 0; i < outerRing.length - 1; i++) {
    if (Math.abs(outerRing[i + 1][0] - outerRing[i][0]) > 170) {
      return vertices; // Skip this polygon
    }
  }

  // Flatten coordinates for earcut (2D projection using lon/lat directly)
  // This works well for relatively small polygons
  const flatCoords: number[] = [];
  const holeIndices: number[] = [];

  // Add outer ring
  for (const coord of outerRing) {
    flatCoords.push(coord[0], coord[1]); // lon, lat
  }

  // Add holes
  for (const hole of holes) {
    holeIndices.push(flatCoords.length / 2);
    for (const coord of hole) {
      flatCoords.push(coord[0], coord[1]);
    }
  }

  // Triangulate
  const indices = earcut(flatCoords, holeIndices.length > 0 ? holeIndices : undefined, 2);

  // Convert triangles to 3D globe coordinates
  // Build a lookup from flat coords to 3D positions
  const allCoords = [...outerRing];
  for (const hole of holes) {
    allCoords.push(...hole);
  }

  for (let i = 0; i < indices.length; i++) {
    const idx = indices[i];
    const coord = allCoords[idx];
    if (coord) {
      const [x, y, z] = toGlobe(coord[1], coord[0]); // lat, lon
      vertices.push(x, y, z);
    }
  }

  return vertices;
}

// Extract filled polygon triangles from GeoJSON
function extractFilledPolygons(geoJson: any): number[] {
  const allVertices: number[] = [];
  if (!geoJson?.features) return allVertices;

  for (const feature of geoJson.features) {
    const geom = feature.geometry;
    if (!geom) continue;

    if (geom.type === 'Polygon') {
      const outerRing = geom.coordinates[0];
      const holes = geom.coordinates.slice(1);
      const verts = triangulatePolygonOnGlobe(outerRing, holes);
      allVertices.push(...verts);
    } else if (geom.type === 'MultiPolygon') {
      for (const polygon of geom.coordinates) {
        const outerRing = polygon[0];
        const holes = polygon.slice(1);
        const verts = triangulatePolygonOnGlobe(outerRing, holes);
        allVertices.push(...verts);
      }
    }
  }

  return allVertices;
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
  const opacityRef = useRef(0);
  const statesOpacityRef = useRef(0);
  const geometriesRef = useRef<{ [key: string]: THREE.BufferGeometry }>({});

  // Refs for mesh objects to update visibility/material directly
  const statesMeshRef = useRef<THREE.LineSegments>(null);
  const urbanMeshRef = useRef<THREE.LineSegments>(null);
  const lakesOutlineMeshRef = useRef<THREE.LineSegments>(null);
  const lakesFillMeshRef = useRef<THREE.Mesh>(null);
  const riversMeshRef = useRef<THREE.LineSegments>(null);
  const roadsMeshRef = useRef<THREE.LineSegments>(null);

  const segmentsRef = useRef<LayerSegments>({});
  const lakesFillGeometryRef = useRef<THREE.BufferGeometry | null>(null);
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
          fetch(urls.lakes).then(r => r.json()).catch(() => null),
          fetch(urls.rivers).then(r => r.json()).catch(() => null),
        ];

        // Only fetch urban and roads in quality mode
        if (!performanceMode) {
          fetches.push(
            fetch(urls.urban!).then(r => r.json()).catch(() => null),
            fetch(urls.roads!).then(r => r.json()).catch(() => null),
          );
        }

        const results = await Promise.all(fetches);
        const [states, lakes, rivers, urban, roads] = results;

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
          lakes: extractSegments(lakes), // Keep outlines too
          rivers: extractSegments(rivers),
          ...(performanceMode ? {} : {
            urban: extractSegments(urban),
            roads: extractSegments(roads),
          }),
        };

        // Create filled lake geometry
        if (lakes) {
          const fillVertices = extractFilledPolygons(lakes);
          if (fillVertices.length > 0) {
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.Float32BufferAttribute(fillVertices, 3));
            geo.computeVertexNormals();
            geo.computeBoundingSphere();
            lakesFillGeometryRef.current = geo;
            // Assign geometry to mesh if it exists
            if (lakesFillMeshRef.current) {
              lakesFillMeshRef.current.geometry = geo;
            }
            console.log(`Lakes: ${fillVertices.length / 9} triangles created`);
          }
        }

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
      urbanMeshRef.current.visible = !performanceMode && opacityRef.current > 0.01 && !!geometriesRef.current.urban;
    }
    // Lake outlines (subtle, behind the fill)
    if (lakesOutlineMeshRef.current) {
      const mat = lakesOutlineMeshRef.current.material as THREE.ShaderMaterial;
      mat.uniforms.uOpacity.value = opacityRef.current * 0.3;
      lakesOutlineMeshRef.current.visible = opacityRef.current > 0.01 && !!geometriesRef.current.lakes;
    }
    // Lake fills
    if (lakesFillMeshRef.current) {
      const mat = lakesFillMeshRef.current.material as THREE.ShaderMaterial;
      mat.uniforms.uOpacity.value = opacityRef.current * 0.65;
      lakesFillMeshRef.current.visible = opacityRef.current > 0.01 && !!lakesFillGeometryRef.current;
    }
    if (riversMeshRef.current) {
      const mat = riversMeshRef.current.material as THREE.ShaderMaterial;
      mat.uniforms.uOpacity.value = opacityRef.current * 0.45;
      riversMeshRef.current.visible = opacityRef.current > 0.01 && !!geometriesRef.current.rivers;
    }
    if (roadsMeshRef.current) {
      const mat = roadsMeshRef.current.material as THREE.ShaderMaterial;
      mat.uniforms.uOpacity.value = opacityRef.current * 0.4;
      roadsMeshRef.current.visible = !performanceMode && opacityRef.current > 0.01 && !!geometriesRef.current.roads;
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
  const lakesOutlineMaterial = useMemo(() => createDepthBiasMaterial('#5a8fa5', 0), []); // Slightly darker for outline
  const lakesFillMaterial = useMemo(() => createFillMaterial('#4a7a8a', 0), []); // Muted blue-grey for fill
  const riversMaterial = useMemo(() => createDepthBiasMaterial('#6a9fb5', 0), []);
  const roadsMaterial = useMemo(() => createDepthBiasMaterial('#c9a86a', 0), []);

  // Create placeholder geometries for each layer (lines)
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

  // Placeholder geometry for lake fills
  const lakeFillPlaceholder = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([], 3));
    return geo;
  }, []);

  // Assign lake fill geometry to mesh when both are ready
  useEffect(() => {
    if (lakesFillMeshRef.current && lakesFillGeometryRef.current) {
      lakesFillMeshRef.current.geometry = lakesFillGeometryRef.current;
    }
  });

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
      {/* Lake fills - render first (behind outlines) */}
      <mesh
        ref={lakesFillMeshRef}
        geometry={lakesFillGeometryRef.current || lakeFillPlaceholder}
        material={lakesFillMaterial}
        renderOrder={1}
        visible={false}
      />
      {/* Lake outlines */}
      <lineSegments
        ref={lakesOutlineMeshRef}
        geometry={placeholderGeometries.lakes}
        material={lakesOutlineMaterial}
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

'use client';

import { useEffect, useRef, useCallback, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import earcut from 'earcut';

const DEG2RAD = Math.PI / 180;
const RADIUS = 1.0; // Same as globe - depth bias handles z-fighting

// Vertex shader for detail lines
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
    vec3 normal = normalize(vWorldPos);
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    if (dot(normal, viewDir) < 0.05) discard;

    gl_FragColor = vec4(uColor, uOpacity);
    gl_FragDepth = gl_FragCoord.z - 0.00002;
  }
`;

// Vertex shader for filled polygons (lakes)
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
    gl_FragDepth = gl_FragCoord.z - 0.000015;
  }
`;

function createLineMaterial(color: string): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: DETAIL_VERTEX,
    fragmentShader: DETAIL_FRAGMENT,
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

// Natural Earth data URLs - using 10m for better global coverage
const DATA_URLS = {
  states: 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_1_states_provinces_lines.geojson',
  lakes: 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_lakes.geojson',
  rivers: 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_rivers_lake_centerlines.geojson',
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

// Triangulate a polygon and project onto globe
// Uses loop instead of spread to avoid stack overflow
function triangulatePolygonOnGlobe(
  outerRing: number[][],
  holes: number[][][] = []
): number[] {
  const vertices: number[] = [];

  if (outerRing.length < 3) return vertices;

  // Check for antimeridian crossing
  for (let i = 0; i < outerRing.length - 1; i++) {
    if (Math.abs(outerRing[i + 1][0] - outerRing[i][0]) > 170) {
      return vertices;
    }
  }

  // Flatten coordinates for earcut
  const flatCoords: number[] = [];
  const holeIndices: number[] = [];

  for (const coord of outerRing) {
    flatCoords.push(coord[0], coord[1]);
  }

  for (const hole of holes) {
    holeIndices.push(flatCoords.length / 2);
    for (const coord of hole) {
      flatCoords.push(coord[0], coord[1]);
    }
  }

  // Triangulate
  const indices = earcut(flatCoords, holeIndices.length > 0 ? holeIndices : undefined, 2);

  // Build coordinate lookup - use loop instead of spread
  const allCoords: number[][] = [];
  for (const coord of outerRing) {
    allCoords.push(coord);
  }
  for (const hole of holes) {
    for (const coord of hole) {
      allCoords.push(coord);
    }
  }

  // Convert to 3D
  for (let i = 0; i < indices.length; i++) {
    const idx = indices[i];
    const coord = allCoords[idx];
    if (coord) {
      const [x, y, z] = toGlobe(coord[1], coord[0]);
      vertices.push(x, y, z);
    }
  }

  return vertices;
}

// Extract filled polygons - uses loop to avoid stack overflow
function extractFilledPolygons(geoJson: any): Float32Array {
  const allVertices: number[] = [];
  if (!geoJson?.features) return new Float32Array(0);

  for (const feature of geoJson.features) {
    const geom = feature.geometry;
    if (!geom) continue;

    if (geom.type === 'Polygon') {
      const outerRing = geom.coordinates[0];
      const holes = geom.coordinates.slice(1);
      const verts = triangulatePolygonOnGlobe(outerRing, holes);
      // Use loop instead of spread to avoid stack overflow
      for (let i = 0; i < verts.length; i++) {
        allVertices.push(verts[i]);
      }
    } else if (geom.type === 'MultiPolygon') {
      for (const polygon of geom.coordinates) {
        const outerRing = polygon[0];
        const holes = polygon.slice(1);
        const verts = triangulatePolygonOnGlobe(outerRing, holes);
        for (let i = 0; i < verts.length; i++) {
          allVertices.push(verts[i]);
        }
      }
    }
  }

  return new Float32Array(allVertices);
}

function isPointFacingCamera(px: number, py: number, pz: number, cx: number, cy: number, cz: number): boolean {
  const len = Math.sqrt(px * px + py * py + pz * pz);
  const nx = px / len, ny = py / len, nz = pz / len;
  const dx = cx - px, dy = cy - py, dz = cz - pz;
  const dlen = Math.sqrt(dx * dx + dy * dy + dz * dz);
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

  const opacityRef = useRef(0);
  const statesOpacityRef = useRef(0);
  const geometriesRef = useRef<{ [key: string]: THREE.BufferGeometry }>({});

  const statesMeshRef = useRef<THREE.LineSegments>(null);
  const lakesOutlineMeshRef = useRef<THREE.LineSegments>(null);
  const lakesFillMeshRef = useRef<THREE.Mesh>(null);
  const riversMeshRef = useRef<THREE.LineSegments>(null);

  const segmentsRef = useRef<LayerSegments>({});
  const lakesFillGeometryRef = useRef<THREE.BufferGeometry | null>(null);
  const lastUpdatePos = useRef(new THREE.Vector3(0, 0, 100));
  const dataLoaded = useRef(false);

  // Load data once on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        const [states, lakes, rivers] = await Promise.all([
          fetch(DATA_URLS.states).then(r => r.json()).catch(() => null),
          fetch(DATA_URLS.lakes).then(r => r.json()).catch(() => null),
          fetch(DATA_URLS.rivers).then(r => r.json()).catch(() => null),
        ]);

        // Extract line segments from GeoJSON
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
          lakes: extractSegments(lakes),
          rivers: extractSegments(rivers),
        };

        // Create filled lake geometry
        if (lakes) {
          const fillVertices = extractFilledPolygons(lakes);
          if (fillVertices.length > 0) {
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.BufferAttribute(fillVertices, 3));
            geo.computeBoundingSphere();
            lakesFillGeometryRef.current = geo;
            if (lakesFillMeshRef.current) {
              lakesFillMeshRef.current.geometry = geo;
            }
            console.log(`Lakes: ${fillVertices.length / 9} triangles created`);
          }
        }

        dataLoaded.current = true;
        console.log('DetailLayer: Data loaded');
      } catch (e) {
        console.error('Failed to load detail layer data:', e);
      }
    };
    loadData();
  }, []);

  // Build visible geometry
  const updateGeometry = useCallback((cx: number, cy: number, cz: number) => {
    for (const [key, segments] of Object.entries(segmentsRef.current)) {
      const verts: number[] = [];

      for (const seg of segments) {
        const [x1, y1, z1] = seg.p1;
        const [x2, y2, z2] = seg.p2;

        if (
          isPointFacingCamera(x1, y1, z1, cx, cy, cz) ||
          isPointFacingCamera(x2, y2, z2, cx, cy, cz)
        ) {
          verts.push(x1, y1, z1, x2, y2, z2);
        }
      }

      if (verts.length > 0) {
        let geo = geometriesRef.current[key];
        if (!geo) {
          geo = new THREE.BufferGeometry();
          geometriesRef.current[key] = geo;
        }

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
      statesOpacityRef.current += statesDiff * (statesDiff < 0 ? 0.4 : 0.15);
    } else {
      statesOpacityRef.current = targetStatesOpacity;
    }

    // Detail layers - start at 1.6, fully visible at 1.3
    const targetOpacity = dist < 1.6 ? Math.min(1, (1.6 - dist) / 0.3) : 0;
    const diff = targetOpacity - opacityRef.current;
    if (Math.abs(diff) >= 0.001) {
      opacityRef.current += diff * (diff < 0 ? 0.4 : 0.15);
    } else {
      opacityRef.current = targetOpacity;
    }

    // Update materials
    if (statesMeshRef.current) {
      const mat = statesMeshRef.current.material as THREE.ShaderMaterial;
      mat.uniforms.uOpacity.value = statesOpacityRef.current * 0.3;
      statesMeshRef.current.visible = statesOpacityRef.current > 0.01 && !!geometriesRef.current.states;
    }
    if (lakesOutlineMeshRef.current) {
      const mat = lakesOutlineMeshRef.current.material as THREE.ShaderMaterial;
      mat.uniforms.uOpacity.value = opacityRef.current * 0.3;
      lakesOutlineMeshRef.current.visible = opacityRef.current > 0.01 && !!geometriesRef.current.lakes;
    }
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

    // Update geometry when camera moves
    const anyVisible = opacityRef.current > 0.01 || statesOpacityRef.current > 0.01;
    if (dataLoaded.current && anyVisible) {
      const moved = camera.position.distanceTo(lastUpdatePos.current);
      const updateThreshold = Math.max(0.02, dist * 0.08);
      if (moved > updateThreshold) {
        lastUpdatePos.current.copy(camera.position);
        updateGeometry(camera.position.x, camera.position.y, camera.position.z);
      }
    }
  });

  // Materials
  const statesMaterial = useMemo(() => createLineMaterial('#a89880'), []);
  const lakesOutlineMaterial = useMemo(() => createLineMaterial('#5a8fa5'), []);
  const lakesFillMaterial = useMemo(() => createFillMaterial('#4a7a8a'), []);
  const riversMaterial = useMemo(() => createLineMaterial('#6a9fb5'), []);

  // Placeholder geometries
  const placeholderGeometries = useMemo(() => {
    const geos: { [key: string]: THREE.BufferGeometry } = {};
    for (const key of ['states', 'lakes', 'rivers']) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute([], 3));
      geos[key] = geo;
      geometriesRef.current[key] = geo;
    }
    return geos;
  }, []);

  const lakeFillPlaceholder = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([], 3));
    return geo;
  }, []);

  useEffect(() => {
    if (lakesFillMeshRef.current && lakesFillGeometryRef.current) {
      lakesFillMeshRef.current.geometry = lakesFillGeometryRef.current;
    }
  });

  return (
    <group>
      <lineSegments
        ref={statesMeshRef}
        geometry={placeholderGeometries.states}
        material={statesMaterial}
        renderOrder={2}
        visible={false}
      />
      <mesh
        ref={lakesFillMeshRef}
        geometry={lakesFillGeometryRef.current || lakeFillPlaceholder}
        material={lakesFillMaterial}
        renderOrder={1}
        visible={false}
      />
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
    </group>
  );
}

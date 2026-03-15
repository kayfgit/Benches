'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import earcut from 'earcut';
import { useAppState } from '@/lib/store';

const DEG2RAD = Math.PI / 180;
const RADIUS = 1.0;
const LAND_RADIUS = 1.001; // Slightly larger to ensure land renders above ocean

// Vertex shader for land/water polygons - passes world position for backface culling
const POLYGON_VERTEX = /* glsl */ `
  varying vec3 vWorldPos;
  varying vec3 vNormal;

  void main() {
    vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
    vNormal = normalize(vWorldPos); // Normal is position for a sphere
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Fragment shader with backface culling and limb darkening
const POLYGON_FRAGMENT = /* glsl */ `
  varying vec3 vWorldPos;
  uniform vec3 uColor;
  uniform float uOpacity;

  void main() {
    // Normal is the normalized position (for a sphere centered at origin)
    vec3 normal = normalize(vWorldPos);
    vec3 viewDir = normalize(cameraPosition - vWorldPos);

    // Discard back-facing fragments (on far side of globe)
    float facing = dot(normal, viewDir);
    if (facing < 0.05) discard;

    // Brown land color with limb darkening
    vec3 baseColor = vec3(0.227, 0.18, 0.141); // #3a2e24
    float limb = smoothstep(0.0, 0.5, facing);
    vec3 color = baseColor * mix(0.7, 1.0, limb);
    gl_FragColor = vec4(color, 1.0);

    // Small depth bias - just enough to render above ocean sphere
    // but below country borders and other overlays
    gl_FragDepth = gl_FragCoord.z - 0.000002;
  }
`;

// Convert lat/lng to 3D position on sphere (for land, uses slightly larger radius)
function toGlobe(lat: number, lon: number): [number, number, number] {
  const phi = (90 - lat) * DEG2RAD;
  const theta = (lon + 180) * DEG2RAD;
  return [
    -(LAND_RADIUS * Math.sin(phi) * Math.cos(theta)),
    LAND_RADIUS * Math.cos(phi),
    LAND_RADIUS * Math.sin(phi) * Math.sin(theta),
  ];
}

// Normalize a point to lie on the land sphere surface (slightly above ocean)
function normalizeToSphere(x: number, y: number, z: number): [number, number, number] {
  const len = Math.sqrt(x * x + y * y + z * z);
  return [x / len * LAND_RADIUS, y / len * LAND_RADIUS, z / len * LAND_RADIUS];
}

// Subdivide triangles so they follow the sphere surface
// Takes flat array of vertices [x1,y1,z1, x2,y2,z2, ...] and returns subdivided version
function subdivideTriangles(vertices: number[], maxEdgeLength: number = 0.15): number[] {
  if (vertices.length === 0) return vertices;

  const result: number[] = [];

  // Process each triangle
  for (let i = 0; i < vertices.length; i += 9) {
    const v0 = [vertices[i], vertices[i + 1], vertices[i + 2]];
    const v1 = [vertices[i + 3], vertices[i + 4], vertices[i + 5]];
    const v2 = [vertices[i + 6], vertices[i + 7], vertices[i + 8]];

    subdivideTriangle(v0, v1, v2, maxEdgeLength, result);
  }

  return result;
}

// Recursively subdivide a triangle until edges are small enough
function subdivideTriangle(
  v0: number[], v1: number[], v2: number[],
  maxEdgeLength: number,
  result: number[]
): void {
  // Calculate edge lengths
  const edge01 = Math.sqrt(
    (v1[0] - v0[0]) ** 2 + (v1[1] - v0[1]) ** 2 + (v1[2] - v0[2]) ** 2
  );
  const edge12 = Math.sqrt(
    (v2[0] - v1[0]) ** 2 + (v2[1] - v1[1]) ** 2 + (v2[2] - v1[2]) ** 2
  );
  const edge20 = Math.sqrt(
    (v0[0] - v2[0]) ** 2 + (v0[1] - v2[1]) ** 2 + (v0[2] - v2[2]) ** 2
  );

  const maxEdge = Math.max(edge01, edge12, edge20);

  // If small enough, add to result
  if (maxEdge <= maxEdgeLength) {
    result.push(...v0, ...v1, ...v2);
    return;
  }

  // Subdivide: split all edges and create 4 triangles
  const m01 = normalizeToSphere(
    (v0[0] + v1[0]) / 2, (v0[1] + v1[1]) / 2, (v0[2] + v1[2]) / 2
  );
  const m12 = normalizeToSphere(
    (v1[0] + v2[0]) / 2, (v1[1] + v2[1]) / 2, (v1[2] + v2[2]) / 2
  );
  const m20 = normalizeToSphere(
    (v2[0] + v0[0]) / 2, (v2[1] + v0[1]) / 2, (v2[2] + v0[2]) / 2
  );

  // Recursively subdivide the 4 new triangles
  subdivideTriangle(v0, m01, m20, maxEdgeLength, result);
  subdivideTriangle(m01, v1, m12, maxEdgeLength, result);
  subdivideTriangle(m20, m12, v2, maxEdgeLength, result);
  subdivideTriangle(m01, m12, m20, maxEdgeLength, result);
}

// Triangulate a polygon ring and return vertices
function triangulateRing(ring: number[][]): number[] {
  if (ring.length < 3) return [];

  // Flatten coordinates for earcut [x0, y0, x1, y1, ...]
  const flatCoords: number[] = [];
  for (const [lon, lat] of ring) {
    flatCoords.push(lon, lat);
  }

  // Get triangle indices
  const indices = earcut(flatCoords);
  if (indices.length === 0) return [];

  // Convert to 3D vertices
  const vertices: number[] = [];
  for (let i = 0; i < indices.length; i++) {
    const idx = indices[i];
    const lon = flatCoords[idx * 2];
    const lat = flatCoords[idx * 2 + 1];
    const [x, y, z] = toGlobe(lat, lon);
    vertices.push(x, y, z);
  }

  return vertices;
}

// Triangulate a polygon with holes, then subdivide for sphere surface
function triangulatePolygon(rings: number[][][]): number[] {
  if (rings.length === 0 || rings[0].length < 3) return [];

  const outerRing = rings[0];
  const holes = rings.slice(1);

  // Flatten all coordinates
  const flatCoords: number[] = [];
  const holeIndices: number[] = [];

  // Add outer ring
  for (const [lon, lat] of outerRing) {
    flatCoords.push(lon, lat);
  }

  // Add holes
  for (const hole of holes) {
    holeIndices.push(flatCoords.length / 2);
    for (const [lon, lat] of hole) {
      flatCoords.push(lon, lat);
    }
  }

  // Triangulate
  const indices = earcut(flatCoords, holeIndices.length > 0 ? holeIndices : undefined);
  if (indices.length === 0) return [];

  // Convert to 3D vertices
  const vertices: number[] = [];
  for (let i = 0; i < indices.length; i++) {
    const idx = indices[i];
    const lon = flatCoords[idx * 2];
    const lat = flatCoords[idx * 2 + 1];
    const [x, y, z] = toGlobe(lat, lon);
    vertices.push(x, y, z);
  }

  // Subdivide triangles so they follow sphere surface (max edge ~0.1 units)
  return subdivideTriangles(vertices, 0.1);
}

// Split polygons that cross the antimeridian
// Returns array of single-ring polygons (no holes preserved)
// Each polygon is number[][][] (array of rings), so return type is number[][][][]
function splitPolygonAtAntimeridian(ring: number[][]): number[][][][] {
  const left: number[][] = [];
  const right: number[][] = [];

  for (let i = 0; i < ring.length; i++) {
    const [lon, lat] = ring[i];
    const side = lon < 0 ? 'left' : 'right';

    // Check for antimeridian crossing
    if (i > 0) {
      const [prevLon] = ring[i - 1];
      if (Math.abs(lon - prevLon) > 170) {
        // Crossing detected - add boundary points to both sides
        const crossLat = lat;
        if (side === 'left') {
          right.push([180, crossLat]);
          left.push([-180, crossLat]);
        } else {
          left.push([-180, crossLat]);
          right.push([180, crossLat]);
        }
      }
    }

    if (side === 'left') {
      left.push([lon, lat]);
    } else {
      right.push([lon, lat]);
    }
  }

  // Return array of polygons (each polygon is array of rings, we only have outer ring)
  const result: number[][][][] = [];
  if (left.length >= 3) result.push([left]);
  if (right.length >= 3) result.push([right]);

  // If no valid splits, return original as single polygon
  return result.length > 0 ? result : [[[...ring]]];
}

// Natural Earth data URLs - land polygons rendered on top of blue ocean sphere
const LAND_URL = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_land.geojson';
const LAKES_URL_LOW = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_lakes.geojson';
const LAKES_URL_HIGH = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_lakes.geojson';

interface LayerData {
  land: number[];
  lakesLow: number[];
  lakesHigh: number[];
}

export function WaterLayer() {
  const { camera } = useThree();
  const { performanceMode } = useAppState();
  const [layerData, setLayerData] = useState<LayerData | null>(null);

  // Refs for meshes to update visibility directly
  const landMeshRef = useRef<THREE.Mesh>(null);
  const lakesMeshRef = useRef<THREE.Mesh>(null);

  // Opacity refs for smooth transitions
  const lakesOpacityRef = useRef(0);

  // Load land and lake data
  useEffect(() => {
    const loadLayerData = async () => {
      try {
        const [landRes, lakesLowRes, lakesHighRes] = await Promise.all([
          fetch(LAND_URL).then(r => r.json()).catch(() => null),
          fetch(LAKES_URL_LOW).then(r => r.json()).catch(() => null),
          performanceMode ? Promise.resolve(null) : fetch(LAKES_URL_HIGH).then(r => r.json()).catch(() => null),
        ]);

        const processGeoJson = (geoJson: any): number[] => {
          if (!geoJson?.features) return [];

          const allVertices: number[] = [];

          for (const feature of geoJson.features) {
            const geom = feature.geometry;
            if (!geom) continue;

            if (geom.type === 'Polygon') {
              // Check for antimeridian crossing
              const outerRing = geom.coordinates[0];
              let crossesAntimeridian = false;
              for (let i = 1; i < outerRing.length; i++) {
                if (Math.abs(outerRing[i][0] - outerRing[i - 1][0]) > 170) {
                  crossesAntimeridian = true;
                  break;
                }
              }

              if (crossesAntimeridian) {
                // Split and triangulate separately
                const splits = splitPolygonAtAntimeridian(outerRing);
                for (const split of splits) {
                  const verts = triangulatePolygon(split);
                  allVertices.push(...verts);
                }
              } else {
                const verts = triangulatePolygon(geom.coordinates);
                allVertices.push(...verts);
              }
            } else if (geom.type === 'MultiPolygon') {
              for (const polygon of geom.coordinates) {
                const outerRing = polygon[0];
                let crossesAntimeridian = false;
                for (let i = 1; i < outerRing.length; i++) {
                  if (Math.abs(outerRing[i][0] - outerRing[i - 1][0]) > 170) {
                    crossesAntimeridian = true;
                    break;
                  }
                }

                if (crossesAntimeridian) {
                  const splits = splitPolygonAtAntimeridian(outerRing);
                  for (const split of splits) {
                    const verts = triangulatePolygon(split);
                    allVertices.push(...verts);
                  }
                } else {
                  const verts = triangulatePolygon(polygon);
                  allVertices.push(...verts);
                }
              }
            }
          }

          return allVertices;
        };

        setLayerData({
          land: processGeoJson(landRes),
          lakesLow: processGeoJson(lakesLowRes),
          lakesHigh: processGeoJson(lakesHighRes),
        });
      } catch (e) {
        console.error('Failed to load layer data:', e);
      }
    };

    loadLayerData();
  }, [performanceMode]);

  // Create geometries from vertex data
  const landGeometry = useMemo(() => {
    if (!layerData?.land.length) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(layerData.land, 3));
    geo.computeVertexNormals();
    return geo;
  }, [layerData?.land]);

  const lakesGeometry = useMemo(() => {
    if (!layerData) return null;
    const verts = performanceMode ? layerData.lakesLow : layerData.lakesHigh;
    if (!verts || !verts.length) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.computeVertexNormals();
    return geo;
  }, [layerData, performanceMode]);

  // Materials
  const landMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      vertexShader: POLYGON_VERTEX,
      fragmentShader: POLYGON_FRAGMENT,
      uniforms: {
        // Using explicit RGB values for warm brown land
        uColor: { value: new THREE.Color(0.227, 0.180, 0.141) }, // #3a2e24
        uOpacity: { value: 1.0 },
      },
      transparent: false,
      depthWrite: true,
      side: THREE.DoubleSide, // Render both sides to ensure visibility
    });
  }, []);

  const lakesMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      vertexShader: POLYGON_VERTEX,
      fragmentShader: POLYGON_FRAGMENT,
      uniforms: {
        uColor: { value: new THREE.Color('#384f61') }, // Same as ocean base
        uOpacity: { value: 0 },
      },
      transparent: true,
      depthWrite: true,
      side: THREE.FrontSide,
    });
  }, []);

  // Animate lake visibility based on zoom
  useFrame(() => {
    const dist = camera.position.length();

    // Lakes: fade in when zoomed closer (dist < 3)
    const targetLakesOpacity = dist < 3 ? Math.min(1, (3 - dist) / 1.5) : 0;
    const lakesDiff = targetLakesOpacity - lakesOpacityRef.current;
    if (Math.abs(lakesDiff) > 0.001) {
      lakesOpacityRef.current += lakesDiff * 0.1;
    }

    // Update lake material
    if (lakesMeshRef.current) {
      const mat = lakesMeshRef.current.material as THREE.ShaderMaterial;
      mat.uniforms.uOpacity.value = lakesOpacityRef.current;
      lakesMeshRef.current.visible = lakesOpacityRef.current > 0.01;
    }
  });

  return (
    <group>
      {/* Land polygons rendered on top of blue ocean sphere */}
      {landGeometry && (
        <mesh
          ref={landMeshRef}
          geometry={landGeometry}
          material={landMaterial}
          renderOrder={0.5}
        />
      )}
      {/* Lakes cut through land to show ocean color */}
      {lakesGeometry && (
        <mesh
          ref={lakesMeshRef}
          geometry={lakesGeometry}
          material={lakesMaterial}
          renderOrder={0.6}
          visible={false}
        />
      )}
    </group>
  );
}

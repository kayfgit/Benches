'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

const DEG2RAD = Math.PI / 180;
const RADIUS = 1.003;

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
  const [opacity, setOpacity] = useState(0);
  const [statesOpacity, setStatesOpacity] = useState(0);
  const [geometries, setGeometries] = useState<{ [key: string]: THREE.BufferGeometry }>({});

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
  const updateGeometry = useCallback((cx: number, cy: number, cz: number) => {
    const newGeometries: { [key: string]: THREE.BufferGeometry } = {};

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
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
        newGeometries[key] = geo;
      }
    }

    setGeometries(newGeometries);
  }, []);

  useFrame(() => {
    const dist = camera.position.length();

    // States layer - start at 2.1, fully visible at 1.8
    const targetStatesOpacity = dist < 2.1 ? Math.min(1, (2.1 - dist) / 0.3) : 0;
    setStatesOpacity(prev => {
      const diff = targetStatesOpacity - prev;
      if (Math.abs(diff) < 0.005) return targetStatesOpacity;
      return prev + diff * 0.12;
    });

    // Detail layers (urban, lakes, rivers, roads) - start at 1.6, fully visible at 1.3
    const targetOpacity = dist < 1.6 ? Math.min(1, (1.6 - dist) / 0.3) : 0;
    setOpacity(prev => {
      const diff = targetOpacity - prev;
      if (Math.abs(diff) < 0.005) return targetOpacity;
      return prev + diff * 0.12;
    });

    // Update geometry when camera moves significantly (throttled)
    const anyVisible = opacity > 0.01 || statesOpacity > 0.01;
    if (dataLoaded.current && anyVisible) {
      const moved = camera.position.distanceTo(lastUpdatePos.current);
      if (moved > 0.15) {
        lastUpdatePos.current.copy(camera.position);
        updateGeometry(camera.position.x, camera.position.y, camera.position.z);
      }
    }
  });

  if (opacity < 0.01 && statesOpacity < 0.01) return null;

  return (
    <group>
      {/* States/provinces - appears first when zooming in */}
      {geometries.states && statesOpacity > 0.01 && (
        <lineSegments geometry={geometries.states}>
          <lineBasicMaterial
            color="#a89880"
            transparent
            opacity={statesOpacity * 0.3}
            depthWrite={false}
          />
        </lineSegments>
      )}

      {/* Urban areas - warm cream outline */}
      {geometries.urban && opacity > 0.01 && (
        <lineSegments geometry={geometries.urban}>
          <lineBasicMaterial
            color="#d4c4a8"
            transparent
            opacity={opacity * 0.45}
            depthWrite={false}
          />
        </lineSegments>
      )}

      {/* Lakes - soft blue */}
      {geometries.lakes && opacity > 0.01 && (
        <lineSegments geometry={geometries.lakes}>
          <lineBasicMaterial
            color="#6a9fb5"
            transparent
            opacity={opacity * 0.55}
            depthWrite={false}
          />
        </lineSegments>
      )}

      {/* Rivers - soft blue */}
      {geometries.rivers && opacity > 0.01 && (
        <lineSegments geometry={geometries.rivers}>
          <lineBasicMaterial
            color="#7ab0c9"
            transparent
            opacity={opacity * 0.45}
            depthWrite={false}
          />
        </lineSegments>
      )}

      {/* Roads - warm gold */}
      {geometries.roads && opacity > 0.01 && (
        <lineSegments geometry={geometries.roads}>
          <lineBasicMaterial
            color="#c9a86a"
            transparent
            opacity={opacity * 0.4}
            depthWrite={false}
          />
        </lineSegments>
      )}
    </group>
  );
}

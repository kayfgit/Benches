'use client';

import { useEffect, useState, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

const DEG2RAD = Math.PI / 180;
const RADIUS = 1.003; // Slightly above country borders

// Natural Earth data URLs
const DATA_URLS = {
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

interface LayerData {
  urban: any;
  lakes: any;
  rivers: any;
  roads: any;
}

export function DetailLayer() {
  const { camera } = useThree();
  const [data, setData] = useState<Partial<LayerData>>({});
  const [visible, setVisible] = useState(false);
  const [opacity, setOpacity] = useState(0);

  // Load all data sources
  useEffect(() => {
    const loadData = async () => {
      try {
        const [urban, lakes, rivers, roads] = await Promise.all([
          fetch(DATA_URLS.urban).then(r => r.json()).catch(() => null),
          fetch(DATA_URLS.lakes).then(r => r.json()).catch(() => null),
          fetch(DATA_URLS.rivers).then(r => r.json()).catch(() => null),
          fetch(DATA_URLS.roads).then(r => r.json()).catch(() => null),
        ]);
        setData({ urban, lakes, rivers, roads });
      } catch (e) {
        console.error('Failed to load detail layer data:', e);
      }
    };
    loadData();
  }, []);

  // Control visibility based on zoom level
  useFrame(() => {
    const dist = camera.position.length();
    // Start showing at distance 2.0, fully visible at 1.5
    const targetOpacity = dist < 2.0 ? Math.min(1, (2.0 - dist) / 0.5) : 0;
    setOpacity(prev => prev + (targetOpacity - prev) * 0.1);
    setVisible(opacity > 0.01);
  });

  // Build geometries for each layer
  const geometries = useMemo(() => {
    const result: { [key: string]: THREE.BufferGeometry } = {};

    const processCoords = (coords: number[][], verts: number[]) => {
      for (let i = 0; i < coords.length - 1; i++) {
        const [lon1, lat1] = coords[i];
        const [lon2, lat2] = coords[i + 1];
        // Skip antimeridian crossings
        if (Math.abs(lon2 - lon1) > 170) continue;
        verts.push(...toGlobe(lat1, lon1), ...toGlobe(lat2, lon2));
      }
    };

    const processGeometry = (geom: any, verts: number[]) => {
      if (!geom) return;

      if (geom.type === 'LineString') {
        processCoords(geom.coordinates, verts);
      } else if (geom.type === 'MultiLineString') {
        geom.coordinates.forEach((line: number[][]) => processCoords(line, verts));
      } else if (geom.type === 'Polygon') {
        // For polygons, draw the outline
        geom.coordinates.forEach((ring: number[][]) => processCoords(ring, verts));
      } else if (geom.type === 'MultiPolygon') {
        geom.coordinates.forEach((poly: number[][][]) =>
          poly.forEach((ring: number[][]) => processCoords(ring, verts))
        );
      }
    };

    const processFeatures = (geoJson: any): number[] => {
      const verts: number[] = [];
      if (!geoJson?.features) return verts;

      for (const feature of geoJson.features) {
        processGeometry(feature.geometry, verts);
      }
      return verts;
    };

    // Process each data source
    if (data.urban) {
      const verts = processFeatures(data.urban);
      if (verts.length > 0) {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
        result.urban = geo;
      }
    }

    if (data.lakes) {
      const verts = processFeatures(data.lakes);
      if (verts.length > 0) {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
        result.lakes = geo;
      }
    }

    if (data.rivers) {
      const verts = processFeatures(data.rivers);
      if (verts.length > 0) {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
        result.rivers = geo;
      }
    }

    if (data.roads) {
      const verts = processFeatures(data.roads);
      if (verts.length > 0) {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
        result.roads = geo;
      }
    }

    return result;
  }, [data]);

  if (!visible) return null;

  return (
    <group>
      {/* Urban areas - warm cream outline */}
      {geometries.urban && (
        <lineSegments geometry={geometries.urban}>
          <lineBasicMaterial
            color="#d4c4a8"
            transparent
            opacity={opacity * 0.4}
            depthWrite={false}
          />
        </lineSegments>
      )}

      {/* Lakes - soft blue */}
      {geometries.lakes && (
        <lineSegments geometry={geometries.lakes}>
          <lineBasicMaterial
            color="#6a9fb5"
            transparent
            opacity={opacity * 0.5}
            depthWrite={false}
          />
        </lineSegments>
      )}

      {/* Rivers - soft blue, thinner feel */}
      {geometries.rivers && (
        <lineSegments geometry={geometries.rivers}>
          <lineBasicMaterial
            color="#7ab0c9"
            transparent
            opacity={opacity * 0.4}
            depthWrite={false}
          />
        </lineSegments>
      )}

      {/* Roads - warm gold/tan */}
      {geometries.roads && (
        <lineSegments geometry={geometries.roads}>
          <lineBasicMaterial
            color="#c9a86a"
            transparent
            opacity={opacity * 0.35}
            depthWrite={false}
          />
        </lineSegments>
      )}
    </group>
  );
}

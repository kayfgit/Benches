'use client';

import { useEffect, useState, useMemo } from 'react';
import * as THREE from 'three';
// @ts-expect-error topojson-client has no bundled types
import { feature } from 'topojson-client';

const DEG2RAD = Math.PI / 180;
const RADIUS = 1.0005; // Minimal offset to avoid z-fighting

function toGlobe(lat: number, lon: number): [number, number, number] {
  const phi = (90 - lat) * DEG2RAD;
  const theta = (lon + 180) * DEG2RAD;
  return [
    -(RADIUS * Math.sin(phi) * Math.cos(theta)),
    RADIUS * Math.cos(phi),
    RADIUS * Math.sin(phi) * Math.sin(theta),
  ];
}

export function CountryBorders() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [geoData, setGeoData] = useState<any>(null);

  useEffect(() => {
    fetch('https://unpkg.com/world-atlas@2/countries-110m.json')
      .then((r) => r.json())
      .then((topology) => {
        const countries = feature(topology, topology.objects.countries);
        setGeoData(countries);
      })
      .catch(() => {});
  }, []);

  const geometry = useMemo(() => {
    if (!geoData) return null;

    const verts: number[] = [];

    const processRing = (ring: number[][]) => {
      for (let i = 0; i < ring.length - 1; i++) {
        const [lon1, lat1] = ring[i];
        const [lon2, lat2] = ring[i + 1];
        // Skip segments that cross the antimeridian
        if (Math.abs(lon2 - lon1) > 170) continue;
        verts.push(...toGlobe(lat1, lon1), ...toGlobe(lat2, lon2));
      }
    };

    for (const feat of geoData.features) {
      const geom = feat.geometry;
      if (geom.type === 'Polygon') {
        geom.coordinates.forEach(processRing);
      } else if (geom.type === 'MultiPolygon') {
        geom.coordinates.forEach((poly: number[][][]) =>
          poly.forEach(processRing)
        );
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    return geo;
  }, [geoData]);

  if (!geometry) return null;

  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial
        color="#f0e6d3"
        transparent
        opacity={0.18}
        depthWrite={false}
        polygonOffset
        polygonOffsetFactor={-1}
        polygonOffsetUnits={-1}
      />
    </lineSegments>
  );
}

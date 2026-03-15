'use client';

import { useEffect, useState, useMemo } from 'react';
import * as THREE from 'three';
// @ts-expect-error topojson-client has no bundled types
import { feature } from 'topojson-client';
import { useAppState } from '@/lib/store';

const DEG2RAD = Math.PI / 180;
const RADIUS = 1.0; // Exact sphere radius - no offset needed with depth bias

// Vertex shader - passes world position for backface culling
const BORDER_VERTEX = /* glsl */ `
  varying vec3 vWorldPos;

  void main() {
    vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Fragment shader - applies depth bias and backface culling
const BORDER_FRAGMENT = /* glsl */ `
  varying vec3 vWorldPos;
  uniform vec3 uColor;
  uniform float uOpacity;

  void main() {
    // Normal is normalized position (sphere centered at origin)
    vec3 normal = normalize(vWorldPos);
    vec3 viewDir = normalize(cameraPosition - vWorldPos);

    // Discard back-facing fragments (prevents seeing through globe)
    if (dot(normal, viewDir) < 0.05) discard;

    gl_FragColor = vec4(uColor, uOpacity);
    // Bias depth slightly toward camera to win depth test against sphere
    gl_FragDepth = gl_FragCoord.z - 0.00001;
  }
`;

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
  const { setGlobeReady } = useAppState();

  useEffect(() => {
    fetch('https://unpkg.com/world-atlas@2/countries-50m.json')
      .then((r) => r.json())
      .then((topology) => {
        const countries = feature(topology, topology.objects.countries);
        setGeoData(countries);
        // Signal that globe is ready after a brief delay for render
        setTimeout(() => setGlobeReady(true), 100);
      })
      .catch(() => {
        // Still mark as ready on error so UI doesn't hang
        setGlobeReady(true);
      });
  }, [setGlobeReady]);

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

  const material = useMemo(() => {
    return new THREE.ShaderMaterial({
      vertexShader: BORDER_VERTEX,
      fragmentShader: BORDER_FRAGMENT,
      uniforms: {
        uColor: { value: new THREE.Color('#f0e6d3') },
        uOpacity: { value: 0.18 },
      },
      transparent: true,
      depthWrite: false,
    });
  }, []);

  if (!geometry) return null;

  return (
    <lineSegments geometry={geometry} material={material} renderOrder={1} />
  );
}

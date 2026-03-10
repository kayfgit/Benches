'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
// @ts-expect-error topojson-client has no bundled types
import { feature } from 'topojson-client';
import { useAppState } from '@/lib/store';

const DEG2RAD = Math.PI / 180;
const RADIUS = 1.002; // Slightly above sphere surface to avoid z-fighting
const MAP_WIDTH = 3.6;
const MAX_LAT = 82;
const maxMercY = Math.log(Math.tan(Math.PI / 4 + (MAX_LAT * DEG2RAD) / 2));

function toGlobe(lat: number, lon: number): [number, number, number] {
  const phi = (90 - lat) * DEG2RAD;
  const theta = (lon + 180) * DEG2RAD;
  return [
    -(RADIUS * Math.sin(phi) * Math.cos(theta)),
    RADIUS * Math.cos(phi),
    RADIUS * Math.sin(phi) * Math.sin(theta),
  ];
}

function toFlat(lat: number, lon: number): [number, number, number] {
  const u = (lon + 180) / 360;
  const clamped = Math.max(-MAX_LAT, Math.min(MAX_LAT, lat));
  const latRad = clamped * DEG2RAD;
  const mercY = Math.log(Math.tan(Math.PI / 4 + latRad / 2));
  return [
    (u - 0.5) * MAP_WIDTH,
    (mercY / maxMercY) * (MAP_WIDTH / 2) * 0.55,
    0.002,
  ];
}

const BORDER_VERTEX = /* glsl */ `
  attribute vec3 aFlatPos;
  uniform float uMorph;

  void main() {
    vec3 pos = mix(position, aFlatPos, uMorph);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const BORDER_FRAGMENT = /* glsl */ `
  uniform float uOpacity;
  uniform vec3 uColor;

  void main() {
    gl_FragColor = vec4(uColor, uOpacity);
  }
`;

export function CountryBorders() {
  const { morphFactor } = useAppState();
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const morphSmooth = useRef(0);
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

    const globeVerts: number[] = [];
    const flatVerts: number[] = [];

    const processRing = (ring: number[][]) => {
      for (let i = 0; i < ring.length - 1; i++) {
        const [lon1, lat1] = ring[i];
        const [lon2, lat2] = ring[i + 1];
        globeVerts.push(...toGlobe(lat1, lon1), ...toGlobe(lat2, lon2));
        flatVerts.push(...toFlat(lat1, lon1), ...toFlat(lat2, lon2));
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
    geo.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(globeVerts, 3)
    );
    geo.setAttribute(
      'aFlatPos',
      new THREE.Float32BufferAttribute(flatVerts, 3)
    );
    return geo;
  }, [geoData]);

  const uniforms = useMemo(
    () => ({
      uMorph: { value: 0 },
      uOpacity: { value: 0.18 },
      uColor: { value: new THREE.Color(0.941, 0.902, 0.827) }, // #f0e6d3
    }),
    []
  );

  useFrame((_, dt) => {
    morphSmooth.current +=
      (morphFactor - morphSmooth.current) * Math.min(dt * 2.8, 1);
    if (materialRef.current) {
      materialRef.current.uniforms.uMorph.value = morphSmooth.current;
    }
  });

  if (!geometry) return null;

  return (
    <lineSegments geometry={geometry} frustumCulled={false}>
      <shaderMaterial
        ref={materialRef}
        vertexShader={BORDER_VERTEX}
        fragmentShader={BORDER_FRAGMENT}
        uniforms={uniforms}
        transparent
        depthWrite={false}
      />
    </lineSegments>
  );
}

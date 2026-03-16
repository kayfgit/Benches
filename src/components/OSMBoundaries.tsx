'use client';

import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useAppState } from '@/lib/store';

const DEG2RAD = Math.PI / 180;
const RADIUS = 1.0;

// Vertex shader
const BORDER_VERTEX = /* glsl */ `
  varying vec3 vWorldPos;
  void main() {
    vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Fragment shader with backface culling
const BORDER_FRAGMENT = /* glsl */ `
  varying vec3 vWorldPos;
  uniform vec3 uColor;
  uniform float uOpacity;
  void main() {
    vec3 normal = normalize(vWorldPos);
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    if (dot(normal, viewDir) < 0.05) discard;
    gl_FragColor = vec4(uColor, uOpacity);
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

function tilePixelToLatLng(tileX: number, tileY: number, zoom: number, px: number, py: number, extent: number = 4096): { lat: number; lng: number } {
  const n = Math.pow(2, zoom);
  const lng = ((tileX + px / extent) / n) * 360 - 180;
  const latRad = Math.atan(Math.sinh(Math.PI * (1 - 2 * (tileY + py / extent) / n)));
  const lat = latRad * (180 / Math.PI);
  return { lat, lng };
}

interface Segment {
  p1: [number, number, number];
  p2: [number, number, number];
}

const TILE_URL = 'https://tiles.versatiles.org/tiles/osm';

export function OSMBoundaries() {
  const { camera } = useThree();
  const { setGlobeReady } = useAppState();

  const [countrySegments, setCountrySegments] = useState<Segment[]>([]);
  const [stateSegments, setStateSegments] = useState<Segment[]>([]);
  const [loaded, setLoaded] = useState(false);

  const countryMeshRef = useRef<THREE.LineSegments>(null);
  const stateMeshRef = useRef<THREE.LineSegments>(null);
  const countryOpacityRef = useRef(0.25);
  const stateOpacityRef = useRef(0.15);

  // Load boundary tiles on mount
  useEffect(() => {
    const loadBoundaries = async () => {
      try {
        // Load vector tile libraries
        const [vt, pbf] = await Promise.all([
          import('@mapbox/vector-tile'),
          import('pbf'),
        ]);
        const VectorTile = vt.VectorTile;
        const Pbf = pbf.default;

        const countries: Segment[] = [];
        const states: Segment[] = [];

        // Load tiles at zoom 5 - covers world with 32x32 = 1024 tiles
        // But we only need tiles that have land, so let's use zoom 3 (8x8 = 64 tiles)
        const zoom = 3;
        const numTiles = Math.pow(2, zoom);

        const tilePromises: Promise<void>[] = [];

        for (let x = 0; x < numTiles; x++) {
          for (let y = 0; y < numTiles; y++) {
            const promise = fetch(`${TILE_URL}/${zoom}/${x}/${y}`)
              .then(async (response) => {
                if (!response.ok) return;
                const buffer = await response.arrayBuffer();
                const tile = new VectorTile(new Pbf(buffer));

                // Try different boundary layer names
                const boundaryLayerNames = ['boundaries', 'boundary', 'admin'];
                for (const layerName of boundaryLayerNames) {
                  const layer = tile.layers[layerName];
                  if (!layer) continue;

                  for (let i = 0; i < layer.length; i++) {
                    const feature = layer.feature(i);
                    if (feature.type !== 2) continue; // Only lines

                    const props = feature.properties;
                    const adminLevel = props.admin_level || props.adminLevel || props.level;
                    const geom = feature.loadGeometry();

                    for (const ring of geom) {
                      for (let j = 0; j < ring.length - 1; j++) {
                        const p1 = ring[j];
                        const p2 = ring[j + 1];
                        const ll1 = tilePixelToLatLng(x, y, zoom, p1.x, p1.y);
                        const ll2 = tilePixelToLatLng(x, y, zoom, p2.x, p2.y);

                        // Skip antimeridian crossings
                        if (Math.abs(ll2.lng - ll1.lng) > 170) continue;

                        const segment: Segment = {
                          p1: toGlobe(ll1.lat, ll1.lng),
                          p2: toGlobe(ll2.lat, ll2.lng),
                        };

                        if (adminLevel === 2 || adminLevel === '2' || adminLevel === undefined) {
                          countries.push(segment);
                        } else if (adminLevel === 4 || adminLevel === '4') {
                          states.push(segment);
                        }
                      }
                    }
                  }
                }
              })
              .catch(() => {});

            tilePromises.push(promise);
          }
        }

        await Promise.all(tilePromises);

        console.log(`OSMBoundaries: Loaded ${countries.length} country segments, ${states.length} state segments from zoom ${zoom}`);

        setCountrySegments(countries);
        setStateSegments(states);
        setLoaded(true);

        // Signal globe is ready
        setTimeout(() => setGlobeReady(true), 100);
      } catch (e) {
        console.error('Failed to load OSM boundaries:', e);
        setGlobeReady(true);
      }
    };

    loadBoundaries();
  }, [setGlobeReady]);

  // Build geometry from segments
  const countryGeometry = useMemo(() => {
    if (countrySegments.length === 0) return null;
    const verts: number[] = [];
    for (const seg of countrySegments) {
      verts.push(...seg.p1, ...seg.p2);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    return geo;
  }, [countrySegments]);

  const stateGeometry = useMemo(() => {
    if (stateSegments.length === 0) return null;
    const verts: number[] = [];
    for (const seg of stateSegments) {
      verts.push(...seg.p1, ...seg.p2);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    return geo;
  }, [stateSegments]);

  const countryMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      vertexShader: BORDER_VERTEX,
      fragmentShader: BORDER_FRAGMENT,
      uniforms: {
        uColor: { value: new THREE.Color('#f0e6d3') },
        uOpacity: { value: 0.25 },
      },
      transparent: true,
      depthWrite: false,
    });
  }, []);

  const stateMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      vertexShader: BORDER_VERTEX,
      fragmentShader: BORDER_FRAGMENT,
      uniforms: {
        uColor: { value: new THREE.Color('#c9b896') },
        uOpacity: { value: 0.15 },
      },
      transparent: true,
      depthWrite: false,
    });
  }, []);

  // Animate opacity based on zoom
  useFrame(() => {
    const dist = camera.position.length();

    // Country borders: visible when zoomed out, fade when very close
    let targetCountryOpacity: number;
    if (dist > 1.2) {
      targetCountryOpacity = 0.25;
    } else if (dist > 1.1) {
      targetCountryOpacity = 0.25 * (dist - 1.1) / 0.1;
    } else {
      targetCountryOpacity = 0;
    }

    // State borders: visible at medium zoom, fade when close or far
    let targetStateOpacity: number;
    if (dist > 2.5) {
      targetStateOpacity = 0;
    } else if (dist > 2.0) {
      targetStateOpacity = 0.2 * (2.5 - dist) / 0.5;
    } else if (dist > 1.2) {
      targetStateOpacity = 0.2;
    } else if (dist > 1.1) {
      targetStateOpacity = 0.2 * (dist - 1.1) / 0.1;
    } else {
      targetStateOpacity = 0;
    }

    // Smooth transitions
    const countryDiff = targetCountryOpacity - countryOpacityRef.current;
    if (Math.abs(countryDiff) > 0.001) {
      countryOpacityRef.current += countryDiff * 0.15;
    } else {
      countryOpacityRef.current = targetCountryOpacity;
    }

    const stateDiff = targetStateOpacity - stateOpacityRef.current;
    if (Math.abs(stateDiff) > 0.001) {
      stateOpacityRef.current += stateDiff * 0.15;
    } else {
      stateOpacityRef.current = targetStateOpacity;
    }

    // Update materials
    if (countryMeshRef.current) {
      const mat = countryMeshRef.current.material as THREE.ShaderMaterial;
      mat.uniforms.uOpacity.value = countryOpacityRef.current;
      countryMeshRef.current.visible = countryOpacityRef.current > 0.01;
    }
    if (stateMeshRef.current) {
      const mat = stateMeshRef.current.material as THREE.ShaderMaterial;
      mat.uniforms.uOpacity.value = stateOpacityRef.current;
      stateMeshRef.current.visible = stateOpacityRef.current > 0.01;
    }
  });

  if (!loaded) return null;

  return (
    <group>
      {countryGeometry && (
        <lineSegments
          ref={countryMeshRef}
          geometry={countryGeometry}
          material={countryMaterial}
          renderOrder={1}
        />
      )}
      {stateGeometry && (
        <lineSegments
          ref={stateMeshRef}
          geometry={stateGeometry}
          material={stateMaterial}
          renderOrder={1}
        />
      )}
    </group>
  );
}

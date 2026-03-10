'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useAppState } from '@/lib/store';

/*
  Flat matte globe — no texture.
  Vertex shader morphs sphere → flat Mercator.
  Fragment shader outputs solid warm brown + limb darkening.
*/

const EARTH_VERTEX = /* glsl */ `
  uniform float uMorph;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorldPos;

  #define MAP_W 3.6
  #define MAX_LAT 1.43117
  #define MAX_MERC 2.6468
  #define PI 3.14159265359

  void main() {
    float lat = (0.5 - uv.y) * PI;
    float latClamped = clamp(lat, -MAX_LAT, MAX_LAT);
    float mercY = log(tan(PI * 0.25 + latClamped * 0.5));

    vec3 flatPos = vec3(
      (uv.x - 0.5) * MAP_W,
      (mercY / MAX_MERC) * (MAP_W * 0.5) * 0.55,
      0.0
    );

    vec3 morphed = mix(position, flatPos, uMorph);

    vec3 flatNorm = vec3(0.0, 0.0, 1.0);
    vec3 morphedNormal = normalize(mix(normal, flatNorm, uMorph));

    vUv = uv;
    vNormal = normalize((modelMatrix * vec4(morphedNormal, 0.0)).xyz);
    vWorldPos = (modelMatrix * vec4(morphed, 1.0)).xyz;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(morphed, 1.0);
  }
`;

const EARTH_FRAGMENT = /* glsl */ `
  uniform float uMorph;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorldPos;

  void main() {
    // Flat warm brown matching Wells #3a2e24
    vec3 baseColor = vec3(0.227, 0.180, 0.141);

    // Globe-mode limb darkening
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    float NdotV  = max(dot(vNormal, viewDir), 0.0);
    float limb   = smoothstep(0.0, 0.55, NdotV);
    float edge   = mix(limb, 1.0, uMorph);
    baseColor *= mix(0.65, 1.0, edge);

    // Flat-mode border
    float bx = smoothstep(0.0, 0.006, vUv.x) * smoothstep(0.0, 0.006, 1.0 - vUv.x);
    float by = smoothstep(0.0, 0.006, vUv.y) * smoothstep(0.0, 0.006, 1.0 - vUv.y);
    float border = mix(1.0, bx * by, uMorph);

    // Flat-mode subtle grid
    float gLon = 1.0 - smoothstep(0.0, 0.0015, abs(fract(vUv.x * 18.0) - 0.5) - 0.496);
    float gLat = 1.0 - smoothstep(0.0, 0.0015, abs(fract(vUv.y * 9.0)  - 0.5) - 0.496);
    float grid = max(gLon, gLat) * 0.06 * uMorph;
    baseColor = mix(baseColor, vec3(0.35, 0.30, 0.25), grid);

    gl_FragColor = vec4(baseColor * border, 1.0);
  }
`;

/* Atmosphere — very subtle warm halo matching Wells rgba(210,140,100,0.22) */
const ATMO_VERTEX = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vWorldPos;
  void main() {
    vNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
    vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const ATMO_FRAGMENT = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vWorldPos;
  void main() {
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    float fresnel = pow(1.0 - max(dot(vNormal, viewDir), 0.0), 6.0);
    // Warm muted orange-brown like Wells
    vec3 color = vec3(0.82, 0.55, 0.39);
    gl_FragColor = vec4(color, fresnel * 0.22);
  }
`;

export function Earth() {
  const { morphFactor } = useAppState();
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const atmoRef = useRef<THREE.Mesh>(null);
  const morphSmooth = useRef(0);

  const geometry = useMemo(() => new THREE.SphereGeometry(1, 128, 64), []);

  const earthUniforms = useMemo(
    () => ({ uMorph: { value: 0 } }),
    []
  );

  useFrame((_, dt) => {
    const speed = 2.8;
    morphSmooth.current += (morphFactor - morphSmooth.current) * Math.min(dt * speed, 1);

    if (materialRef.current) {
      materialRef.current.uniforms.uMorph.value = morphSmooth.current;
    }

    if (atmoRef.current) {
      const t = morphSmooth.current;
      atmoRef.current.scale.setScalar(Math.max(1.12 * (1 - t), 0.001));
      (atmoRef.current.material as THREE.ShaderMaterial).opacity = (1 - t) * 0.22;
    }
  });

  return (
    <>
      <mesh geometry={geometry} frustumCulled={false}>
        <shaderMaterial
          ref={materialRef}
          vertexShader={EARTH_VERTEX}
          fragmentShader={EARTH_FRAGMENT}
          uniforms={earthUniforms}
        />
      </mesh>

      {/* Very subtle warm atmospheric halo */}
      <mesh ref={atmoRef} scale={1.12}>
        <sphereGeometry args={[1, 64, 32]} />
        <shaderMaterial
          vertexShader={ATMO_VERTEX}
          fragmentShader={ATMO_FRAGMENT}
          transparent
          side={THREE.BackSide}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
    </>
  );
}

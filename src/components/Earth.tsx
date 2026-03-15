'use client';

import { useMemo } from 'react';
import * as THREE from 'three';
import { useAppState } from '@/lib/store';

/*
  Flat matte globe - warm brown sphere with subtle limb darkening.
*/

const EARTH_VERTEX = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vWorldPos;

  void main() {
    vNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
    vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const EARTH_FRAGMENT = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vWorldPos;

  void main() {
    // Flat warm brown matching Wells #3a2e24
    vec3 baseColor = vec3(0.227, 0.180, 0.141);

    // Limb darkening for 3D depth
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    float NdotV = max(dot(vNormal, viewDir), 0.0);
    float limb = smoothstep(0.0, 0.55, NdotV);
    baseColor *= mix(0.65, 1.0, limb);

    gl_FragColor = vec4(baseColor, 1.0);
  }
`;

/* Atmosphere - very subtle warm halo */
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
    // Warm muted orange-brown
    vec3 color = vec3(0.82, 0.55, 0.39);
    gl_FragColor = vec4(color, fresnel * 0.22);
  }
`;

export function Earth() {
  const { performanceMode } = useAppState();

  // Performance mode: reduced segments; Quality mode: higher detail
  const geometry = useMemo(
    () => new THREE.SphereGeometry(1, performanceMode ? 64 : 128, performanceMode ? 32 : 64),
    [performanceMode]
  );
  const atmoGeometry = useMemo(
    () => new THREE.SphereGeometry(1, performanceMode ? 32 : 64, performanceMode ? 16 : 32),
    [performanceMode]
  );

  return (
    <>
      <mesh geometry={geometry}>
        <shaderMaterial
          vertexShader={EARTH_VERTEX}
          fragmentShader={EARTH_FRAGMENT}
        />
      </mesh>

      {/* Subtle warm atmospheric halo */}
      <mesh scale={1.12} geometry={atmoGeometry}>
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

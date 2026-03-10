'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import * as THREE from 'three';
import { useAppState } from '@/lib/store';

const EARTH_VERTEX = /* glsl */ `
  uniform float uMorph;
  attribute vec3 aFlatPosition;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorldPos;

  void main() {
    vec3 morphed = mix(position, aFlatPosition, uMorph);
    vec3 flatNorm = vec3(0.0, 0.0, 1.0);
    vec3 morphedNormal = normalize(mix(normal, flatNorm, uMorph));

    vUv = uv;
    vNormal = normalize((modelMatrix * vec4(morphedNormal, 0.0)).xyz);
    vWorldPos = (modelMatrix * vec4(morphed, 1.0)).xyz;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(morphed, 1.0);
  }
`;

const EARTH_FRAGMENT = /* glsl */ `
  uniform sampler2D uTexture;
  uniform float uMorph;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorldPos;

  void main() {
    vec4 tex = texture2D(uTexture, vUv);
    vec3 color = tex.rgb;

    // Slight desaturation for moodier look
    float lum = dot(color, vec3(0.299, 0.587, 0.114));
    color = mix(vec3(lum), color, 0.82);

    // Warm tint
    color *= vec3(1.02, 0.98, 0.94);

    // Edge darkening in globe mode (limb darkening)
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    float NdotV = max(dot(vNormal, viewDir), 0.0);
    float limbDark = smoothstep(0.0, 0.45, NdotV);
    float edgeFactor = mix(limbDark, 1.0, uMorph);
    color *= edgeFactor;

    // Subtle atmosphere tint at edges
    float fresnel = pow(1.0 - NdotV, 3.5);
    vec3 atmoColor = vec3(0.35, 0.55, 0.9);
    color = mix(color, atmoColor, fresnel * 0.2 * (1.0 - uMorph));

    // Flat mode border
    float bx = smoothstep(0.0, 0.005, vUv.x) * smoothstep(0.0, 0.005, 1.0 - vUv.x);
    float by = smoothstep(0.0, 0.005, vUv.y) * smoothstep(0.0, 0.005, 1.0 - vUv.y);
    float border = mix(1.0, bx * by, uMorph);

    // Flat mode: subtle grid lines
    float gridLon = 1.0 - smoothstep(0.0, 0.001, abs(fract(vUv.x * 18.0) - 0.5) - 0.495);
    float gridLat = 1.0 - smoothstep(0.0, 0.001, abs(fract(vUv.y * 9.0) - 0.5) - 0.495);
    float grid = max(gridLon, gridLat) * 0.08 * uMorph;
    color = mix(color, vec3(0.45, 0.6, 0.8), grid);

    gl_FragColor = vec4(color * border, 1.0);
  }
`;

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
    float fresnel = pow(1.0 - max(dot(vNormal, viewDir), 0.0), 4.5);
    vec3 innerColor = vec3(0.25, 0.5, 0.95);
    vec3 outerColor = vec3(0.45, 0.75, 1.0);
    vec3 color = mix(innerColor, outerColor, fresnel);
    gl_FragColor = vec4(color, fresnel * 0.45);
  }
`;

const DEG2RAD = Math.PI / 180;
const MAP_WIDTH = 3.6;
const MAX_LAT = 82;

export function Earth() {
  const { morphFactor } = useAppState();
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const atmoRef = useRef<THREE.Mesh>(null);
  const morphSmooth = useRef(0);

  const texture = useTexture(
    'https://unpkg.com/three-globe@2.31.1/example/img/earth-blue-marble.jpg'
  );
  texture.colorSpace = THREE.SRGBColorSpace;

  const geometry = useMemo(() => {
    const geo = new THREE.SphereGeometry(1, 128, 64);
    const uvs = geo.attributes.uv;
    const flatPos = new Float32Array(uvs.count * 3);
    const maxMercY = Math.log(Math.tan(Math.PI / 4 + (MAX_LAT * DEG2RAD) / 2));

    for (let i = 0; i < uvs.count; i++) {
      const u = uvs.getX(i);
      const v = uvs.getY(i);
      const lat = 90 - v * 180;
      const clamped = Math.max(-MAX_LAT, Math.min(MAX_LAT, lat));
      const latRad = clamped * DEG2RAD;
      const mercY = Math.log(Math.tan(Math.PI / 4 + latRad / 2));

      flatPos[i * 3] = (u - 0.5) * MAP_WIDTH;
      flatPos[i * 3 + 1] = (mercY / maxMercY) * (MAP_WIDTH / 2) * 0.55;
      flatPos[i * 3 + 2] = 0;
    }

    geo.setAttribute('aFlatPosition', new THREE.BufferAttribute(flatPos, 3));
    return geo;
  }, []);

  const earthUniforms = useMemo(
    () => ({
      uTexture: { value: texture },
      uMorph: { value: 0 },
    }),
    [texture]
  );

  useFrame((_, dt) => {
    const speed = 3.5;
    morphSmooth.current += (morphFactor - morphSmooth.current) * Math.min(dt * speed, 1);

    if (materialRef.current) {
      materialRef.current.uniforms.uMorph.value = morphSmooth.current;
    }

    if (atmoRef.current) {
      const atmoScale = 1.06 * (1 - morphSmooth.current);
      atmoRef.current.scale.setScalar(Math.max(atmoScale, 0.001));
      (atmoRef.current.material as THREE.ShaderMaterial).opacity = 1 - morphSmooth.current;
    }
  });

  return (
    <>
      <mesh geometry={geometry}>
        <shaderMaterial
          ref={materialRef}
          vertexShader={EARTH_VERTEX}
          fragmentShader={EARTH_FRAGMENT}
          uniforms={earthUniforms}
        />
      </mesh>

      {/* Atmosphere glow */}
      <mesh ref={atmoRef} scale={1.06}>
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

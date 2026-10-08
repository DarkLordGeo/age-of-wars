import { WIND } from './wind';

/**
 * Drifting cloud shadows: a slow fbm noise field in world XZ that dims the *direct* sunlight
 * (not the sky fill), so large soft shadow patches glide across the meadow. Shared GLSL so the
 * terrain and the grass tufts on it darken together.
 */
export const CLOUD_UNIFORMS = { uCloudTime: WIND.time };

export const CLOUD_GLSL = /* glsl */ `
uniform float uCloudTime;
float cHash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 15718.37); }
float cNoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(cHash(i), cHash(i + vec2(1.0, 0.0)), f.x), mix(cHash(i + vec2(0.0, 1.0)), cHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
// 1.0 = full sun, down to ~0.65 under the densest cloud.
float cloudShade(vec2 xz) {
  vec2 p = xz * 0.011 + vec2(uCloudTime * 0.012, uCloudTime * 0.004);
  float n = cNoise(p) * 0.55 + cNoise(p * 2.1 + 3.7) * 0.3 + cNoise(p * 4.3 + 9.1) * 0.15;
  return 1.0 - 0.35 * smoothstep(0.55, 0.8, n);
}
`;

/** Insert after `#include <lights_fragment_end>`: scale the direct light by the cloud shade. */
export const CLOUD_APPLY = (xz: string): string => /* glsl */ `
{
  float cs = cloudShade(${xz});
  reflectedLight.directDiffuse *= cs;
  reflectedLight.directSpecular *= cs;
}`;

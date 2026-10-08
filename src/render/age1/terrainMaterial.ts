import { MeshStandardMaterial, type WebGLProgramParametersWithUniforms } from 'three';
import { age1Texture } from './materials';

/**
 * Splat-blended ground: grass (Poly Haven leafy_grass), worn dirt, trampled mud and rock, mixed per vertex by the
 * `splat` attribute (x = dirt, y = rock, z = mud; grass is the remainder) and broken up with
 * procedural noise so blend edges look organic rather than following the mesh grid.
 * Textures are sampled in world space (no UV seams) at two scales to hide tiling.
 *
 * Vertex colours still apply on top (subtle per-area tint). Without textures (tests) it renders
 * plain vertex colours.
 */
export function createTerrainMaterial(): MeshStandardMaterial {
  const grass = age1Texture('ground_leafy_grass.jpg');
  const dirt = age1Texture('ground_dirt_floor.jpg');
  const rock = age1Texture('ground_rocky_trail_02.jpg');
  const mud = age1Texture('ground_brown_mud_dry.jpg');
  const mat = new MeshStandardMaterial({ name: 'Terrain', vertexColors: true, roughness: 1, metalness: 0 });
  if (!grass || !dirt || !rock || !mud) return mat;

  mat.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    shader.uniforms.tGrass = { value: grass };
    shader.uniforms.tDirt = { value: dirt };
    shader.uniforms.tRock = { value: rock };
    shader.uniforms.tMud = { value: mud };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 splat;\nvarying vec3 vSplat;\nvarying vec2 vGround;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSplat = splat;\nvGround = (modelMatrix * vec4(transformed, 1.0)).xz;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform sampler2D tGrass;
uniform sampler2D tDirt;
uniform sampler2D tRock;
uniform sampler2D tMud;
varying vec3 vSplat;
varying vec2 vGround;
float gHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float gNoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(gHash(i), gHash(i + vec2(1.0, 0.0)), f.x), mix(gHash(i + vec2(0.0, 1.0)), gHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
vec3 twoScale(sampler2D t, vec2 p, float s) {
  // two rotated/offset scales of the same texture: hides the 1 km repeat pattern
  vec3 a = texture2D(t, p * s).rgb;
  vec2 r = mat2(0.8, -0.6, 0.6, 0.8) * p;
  vec3 b = texture2D(t, r * s * 0.37 + 0.31).rgb;
  return mix(a, b, 0.42);
}`,
      )
      .replace(
        '#include <map_fragment>',
        `{
  float n = gNoise(vGround * 0.18) * 0.6 + gNoise(vGround * 0.9) * 0.3 + gNoise(vGround * 3.1) * 0.1;
  // Multipliers calibrate each photo texture to the Age 1 palette (meadow #6a9444, path #8a7352).
  vec3 cGrass = twoScale(tGrass, vGround, 0.22) * vec3(0.5, 1.22, 0.52);
  // large-scale patchiness of the meadow (lusher / drier)
  float lush = gNoise(vGround * 0.035 + 7.0);
  cGrass *= mix(vec3(0.92, 0.98, 0.86), vec3(1.08, 1.04, 0.92), lush);
  vec3 cDirt = twoScale(tDirt, vGround, 0.3) * vec3(0.56, 0.64, 0.66);
  vec3 cRock = twoScale(tRock, vGround, 0.16) * vec3(0.95, 1.3, 1.75);
  vec3 cMud = twoScale(tMud, vGround, 0.25) * vec3(0.98, 1.0, 1.02);
  float wDirt = smoothstep(0.38, 0.62, vSplat.x + (n - 0.5) * 0.55);
  float wMud = smoothstep(0.38, 0.62, vSplat.z + (n - 0.5) * 0.5);
  float wRock = smoothstep(0.4, 0.6, vSplat.y + (n - 0.5) * 0.45);
  vec3 col = mix(cGrass, cDirt, wDirt);
  col = mix(col, cMud, wMud);
  col = mix(col, cRock, wRock);
  diffuseColor.rgb *= col;
}`,
      );
  };
  mat.customProgramCacheKey = () => 'age1-terrain';
  return mat;
}

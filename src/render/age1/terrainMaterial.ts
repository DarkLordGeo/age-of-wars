import { MeshStandardMaterial, type WebGLProgramParametersWithUniforms } from 'three';
import { CLOUD_APPLY, CLOUD_GLSL, CLOUD_UNIFORMS } from './clouds';
import { age1Texture } from './materials';

/**
 * Splat-blended ground: grass (Poly Haven leafy_grass), worn dirt, trampled mud and rock, mixed per
 * vertex by the `splat` attribute (x = dirt, y = rock, z = mud; grass is the remainder) and broken
 * up with procedural noise so blend edges look organic rather than following the mesh grid.
 *
 * - Colour and normal maps are sampled in world space (no UV seams), colour at two scales to hide
 *   tiling. The four normal maps are blended with the same weights and applied in world space
 *   (tangent = +X, bitangent = +Z), so ruts, pebbles and grass clumps catch the low sun.
 * - Drifting cloud shadows dim the direct sunlight (clouds.ts).
 *
 * Vertex colours still apply on top (subtle per-area tint). Without textures (tests) it renders
 * plain vertex colours.
 */
export function createTerrainMaterial(): MeshStandardMaterial {
  const tex = {
    tGrass: age1Texture('ground_leafy_grass.jpg'),
    tDirt: age1Texture('ground_dirt_floor.jpg'),
    tRock: age1Texture('ground_rocky_trail_02.jpg'),
    tMud: age1Texture('ground_brown_mud_dry.jpg'),
    nGrass: age1Texture('ground_leafy_grass_nor.jpg'),
    nDirt: age1Texture('ground_dirt_floor_nor.jpg'),
    nRock: age1Texture('ground_rocky_trail_02_nor.jpg'),
    nMud: age1Texture('ground_brown_mud_dry_nor.jpg'),
  };
  const mat = new MeshStandardMaterial({ name: 'Terrain', vertexColors: true, roughness: 0.95, metalness: 0 });
  if (Object.values(tex).some((t) => !t)) return mat;

  mat.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    for (const [k, t] of Object.entries(tex)) shader.uniforms[k] = { value: t };
    Object.assign(shader.uniforms, CLOUD_UNIFORMS);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 splat;\nvarying vec3 vSplat;\nvarying vec2 vGround;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSplat = splat;\nvGround = (modelMatrix * vec4(transformed, 1.0)).xz;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform sampler2D tGrass, tDirt, tRock, tMud, nGrass, nDirt, nRock, nMud;
varying vec3 vSplat;
varying vec2 vGround;
float gwDirt, gwMud, gwRock; // blend weights, shared by the colour and normal stages
float gHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float gNoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(gHash(i), gHash(i + vec2(1.0, 0.0)), f.x), mix(gHash(i + vec2(0.0, 1.0)), gHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
vec3 twoScale(sampler2D t, vec2 p, float s) {
  // two rotated/offset scales of the same texture: hides the repeat pattern
  vec3 a = texture2D(t, p * s).rgb;
  vec2 r = mat2(0.8, -0.6, 0.6, 0.8) * p;
  vec3 b = texture2D(t, r * s * 0.37 + 0.31).rgb;
  return mix(a, b, 0.42);
}
${CLOUD_GLSL}`,
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
  gwDirt = smoothstep(0.38, 0.62, vSplat.x + (n - 0.5) * 0.55);
  gwMud = smoothstep(0.38, 0.62, vSplat.z + (n - 0.5) * 0.5);
  gwRock = smoothstep(0.4, 0.6, vSplat.y + (n - 0.5) * 0.45);
  vec3 col = mix(cGrass, cDirt, gwDirt);
  col = mix(col, cMud, gwMud);
  col = mix(col, cRock, gwRock);
  diffuseColor.rgb *= col;
}`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
{
  vec3 tn = texture2D(nGrass, vGround * 0.22).xyz;
  tn = mix(tn, texture2D(nDirt, vGround * 0.3).xyz, gwDirt);
  tn = mix(tn, texture2D(nMud, vGround * 0.25).xyz, gwMud);
  tn = mix(tn, texture2D(nRock, vGround * 0.16).xyz, gwRock);
  tn = tn * 2.0 - 1.0;
  tn.xy *= 0.9; // strength
  // geometry normal to world space, perturb with T = +X, B = +Z (uv follows world XZ, so the frame is mirrored), back to view
  vec3 nW = normalize((vec4(normal, 0.0) * viewMatrix).xyz);
  vec3 T = normalize(vec3(1.0, 0.0, 0.0) - nW * nW.x);
  vec3 B = normalize(cross(T, nW)); // +Z on flat ground: green = direction of increasing v
  vec3 pW = normalize(T * tn.x + B * tn.y + nW * tn.z);
  normal = normalize((viewMatrix * vec4(pW, 0.0)).xyz);
}`,
      )
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>\n${CLOUD_APPLY('vGround')}`);
  };
  mat.customProgramCacheKey = () => 'age1-terrain-v2';
  return mat;
}

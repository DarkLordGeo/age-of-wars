import type { Material, WebGLProgramParametersWithUniforms } from 'three';

/**
 * Shared wind clock + a vertex-shader patch that sways instanced foliage. One uniform object is
 * shared by every patched material, so advancing `WIND.time` animates all of them.
 */
export const WIND = { time: { value: 0 } };

export interface SwayOptions {
  /** Sway (m) per metre of height above the instance origin. */
  strength: number;
  /** How the displacement grows with height: 1 = linear (trees), 2 = quadratic (grass blades). */
  power: number;
  /** Temporal frequency. */
  speed: number;
}

/**
 * Patches a (Mesh)StandardMaterial used by an InstancedMesh: displaces vertices horizontally by
 * height (`transformed.y`, in model space), phase-shifted by the instance's world position so
 * neighbours don't move in lockstep. Optionally forces up-facing normals (grass cards).
 */
export function addSway(material: Material, opts: SwayOptions, upNormals = false): void {
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms, renderer) => {
    prev?.call(material, shader, renderer);
    shader.uniforms.uWindTime = WIND.time;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float uWindTime;`,
      )
      .replace(
        '#include <beginnormal_vertex>',
        upNormals ? 'vec3 objectNormal = vec3(0.0, 1.0, 0.0);\n#ifdef USE_TANGENT\nvec3 objectTangent = vec3(1.0, 0.0, 0.0);\n#endif' : '#include <beginnormal_vertex>',
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
{
  #ifdef USE_INSTANCING
  vec2 wOrigin = vec2(instanceMatrix[3][0], instanceMatrix[3][2]);
  mat3 im = mat3(instanceMatrix);
  #else
  vec2 wOrigin = vec2(0.0);
  mat3 im = mat3(1.0);
  #endif
  float s2 = max(dot(im[1], im[1]), 1e-6);
  float h = max(transformed.y, 0.0) * sqrt(s2); // height in world metres
  float k = pow(h, ${opts.power.toFixed(1)}) * ${opts.strength.toFixed(4)};
  float ph = wOrigin.x * 0.31 + wOrigin.y * 0.17;
  float t = uWindTime * ${opts.speed.toFixed(3)};
  float gust = 0.65 + 0.35 * sin(t * 0.37 + wOrigin.x * 0.05);
  // World-space push (prevailing wind toward +X), mapped back into instance space.
  vec3 push = vec3((sin(t + ph) * 0.8 + sin(t * 2.3 + ph * 1.7) * 0.25 + 0.5), 0.0, sin(t * 0.83 + ph * 1.3) * 0.5) * k * gust;
  transformed += transpose(im) * push / s2;
}`,
      );
    if (upNormals) {
      // Keep the up-normal on back faces too (DoubleSide would flip it and turn cards black).
      shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\nnormal = normalize(vNormal);');
    }
  };
  material.customProgramCacheKey = () => `sway:${opts.strength}:${opts.power}:${opts.speed}:${upNormals}`;
}

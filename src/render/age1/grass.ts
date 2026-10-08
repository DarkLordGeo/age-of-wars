import {
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
  type Scene,
} from 'three';
import { CLOUD_APPLY, CLOUD_GLSL, CLOUD_UNIFORMS } from './clouds';
import { age1Texture } from './materials';
import { excludeFromAO } from '../post';
import { addSway } from './wind';

/**
 * Grass tufts: three crossed alpha cards per tuft (grass_tuft_green/dry.png), instanced, swaying
 * in the wind (quadratic with height, so roots stay put). Normals point up so the cards light
 * like the ground they grow from instead of flickering dark when seen edge-on.
 */
export interface TuftPlacement {
  x: number;
  y: number;
  z: number;
  /** Tuft height in metres. */
  height: number;
  rotY: number;
  tint: Color;
}

function tuftGeometry(): BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const w = 1.0; // width relative to height (texture is square)
  for (let c = 0; c < 3; c++) {
    const a = (c / 3) * Math.PI;
    const dx = (Math.cos(a) * w) / 2;
    const dz = (Math.sin(a) * w) / 2;
    const base = pos.length / 3;
    pos.push(-dx, 0, -dz, dx, 0, dz, -dx, 1, -dz, dx, 1, dz);
    uv.push(0, 0, 1, 0, 0, 1, 1, 1);
    idx.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new Float32BufferAttribute(new Array(pos.length).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

let geo: BufferGeometry | null = null;

export function addGrassTufts(scene: Scene, file: 'grass_tuft_green.png' | 'grass_tuft_dry.png' | 'grass_tuft_meadow.png', placements: readonly TuftPlacement[]): InstancedMesh | null {
  if (placements.length === 0) return null;
  geo ??= tuftGeometry();
  const mat = new MeshStandardMaterial({
    name: file.includes('dry') ? 'GrassDry' : file.includes('meadow') ? 'GrassMeadow' : 'GrassGreen',
    map: age1Texture(file),
    alphaTest: 0.35,
    side: DoubleSide,
    roughness: 1,
  });
  addSway(mat, { strength: 0.16, power: 2, speed: 1.7 }, true);
  // Same drifting cloud shadows as the terrain under the tufts.
  const sway = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, renderer) => {
    sway.call(mat, shader, renderer);
    Object.assign(shader.uniforms, CLOUD_UNIFORMS);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vCloudXZ;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvCloudXZ = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec2 vCloudXZ;\n${CLOUD_GLSL}`)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>\n${CLOUD_APPLY('vCloudXZ')}`);
  };
  const swayKey = mat.customProgramCacheKey();
  mat.customProgramCacheKey = () => `${swayKey}:clouds`;
  const mesh = new InstancedMesh(geo, mat, placements.length);
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  const m = new Matrix4();
  const q = new Quaternion();
  const up = new Vector3(0, 1, 0);
  const p3 = new Vector3();
  const s3 = new Vector3();
  for (let i = 0; i < placements.length; i++) {
    const p = placements[i]!;
    q.setFromAxisAngle(up, p.rotY);
    m.compose(p3.set(p.x, p.y, p.z), q, s3.set(p.height * 1.1, p.height, p.height * 1.1));
    mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, p.tint);
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
  excludeFromAO(mesh);
  scene.add(mesh);
  return mesh;
}

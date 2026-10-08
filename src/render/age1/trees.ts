import {
  BufferGeometry,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
  type Color,
  type Material,
  type Scene,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { rng32 } from './builder';
import { age1Material, age1Texture } from './materials';
import { excludeFromAO } from '../post';
import { addSway } from './wind';

/**
 * Procedural conifers (spruce/fir): a tapered bark trunk carrying whorls of drooping
 * alpha-cut frond cards (conifer_frond_*.png), plus a bare dead tree. Each variant is one
 * trunk geometry + one frond geometry, drawn instanced: a forest of hundreds of trees costs a
 * few draw calls. Unit height is 1 m (scale instances to the wanted height).
 */
export interface TreeVariant {
  trunk: BufferGeometry;
  fronds: BufferGeometry | null;
  frondMaterial: Material | null;
  trunkMaterial: Material;
  /** Triangles of one tree (trunk + fronds). */
  tris: number;
}

export interface TreePlacement {
  x: number;
  y: number;
  z: number;
  height: number;
  rotY: number;
  tint?: Color;
}

const UP = new Vector3(0, 1, 0);

let frondMats: MeshStandardMaterial[] | null = null;
function frondMaterials(): MeshStandardMaterial[] {
  if (!frondMats) {
    frondMats = ['conifer_frond_a.png', 'conifer_frond_b.png'].map((f) => {
      const m = new MeshStandardMaterial({
        name: 'ConiferFrond',
        map: age1Texture(f),
        alphaTest: 0.42,
        side: DoubleSide,
        roughness: 0.9,
        color: 0xd0dcc0,
        vertexColors: true,
      });
      addSway(m, { strength: 0.012, power: 1.2, speed: 1.1 });
      // Fronds carry crown-shaped normals (out from the trunk): keep them on both card faces
      // instead of flipping on the back face, which turns half the needles black.
      const sway = m.onBeforeCompile;
      m.onBeforeCompile = (shader, renderer) => {
        sway.call(m, shader, renderer);
        shader.fragmentShader = shader.fragmentShader.replace('float faceDirection = gl_FrontFacing ? 1.0 : - 1.0;', 'float faceDirection = 1.0;');
      };
      const key = m.customProgramCacheKey();
      m.customProgramCacheKey = () => `${key}:crown-normals`;
      return m;
    });
  }
  return frondMats;
}

let trunkMat: MeshStandardMaterial | null = null;
function trunkMaterial(): MeshStandardMaterial {
  if (!trunkMat) {
    trunkMat = age1Material('bark').clone();
    trunkMat.name = 'TreeBark';
    addSway(trunkMat, { strength: 0.012, power: 1.2, speed: 1.1 });
  }
  return trunkMat;
}

/**
 * One frond card: a quad strip along +X from the branch base, `len` long and `width` wide,
 * drooping by `droop` (fraction of len) at the tip, rolled by `roll` around its own axis.
 */
function frondCard(len: number, width: number, droop: number, roll: number, segs = 2): BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const nrm: number[] = [];
  const idx: number[] = [];
  const cr = Math.cos(roll);
  const sr = Math.sin(roll);
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const x = t * len;
    const y = -droop * len * t * t;
    for (const side of [-1, 1]) {
      const w = (side * width) / 2;
      // roll the width axis (z) around x
      pos.push(x, y + w * sr, w * cr);
      uv.push(t, side < 0 ? 0 : 1);
      nrm.push(0, cr, -sr);
    }
  }
  for (let i = 0; i < segs; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

const m4 = new Matrix4();
const q = new Quaternion();
const q2 = new Quaternion();
const v = new Vector3();

/** A 1 m tall conifer. `seed` varies whorl count, spacing, branch angles and silhouette. */
export function buildConifer(seed: number): TreeVariant {
  const rnd = rng32(0xc0f1 + seed * 7919);
  const slim = 0.72 + rnd() * 0.32; // crown width factor
  const crownBase = 0.15 + rnd() * 0.06;
  const whorls = 15 + Math.floor(rnd() * 5);
  const cards: BufferGeometry[] = [];

  for (let i = 0; i < whorls; i++) {
    const t = i / (whorls - 1); // 0 = lowest whorl
    const y = crownBase + (0.97 - crownBase) * Math.pow(t, 0.9) + (rnd() - 0.5) * 0.02;
    const n = Math.max(3, Math.round(8 - t * 4 + rnd()));
    const pitch = -0.26 + t * 0.5; // lower branches droop, upper ones lift
    const offset = rnd() * Math.PI * 2;
    for (let j = 0; j < n; j++) {
      if (rnd() < 0.08 && t < 0.85) continue; // the odd missing branch breaks the silhouette
      const yaw = offset + (j / n) * Math.PI * 2 + (rnd() - 0.5) * 0.6;
      const len = (0.04 + 0.32 * Math.pow(1 - t, 0.9)) * slim * (0.72 + rnd() * 0.5);
      const rolls = [0.2 * (rnd() - 0.5), 0.85 + rnd() * 0.35, -(0.85 + rnd() * 0.35)];
      for (const roll of rolls) {
        const card = frondCard(len, len * 0.6, 0.2 + (1 - t) * 0.18 + rnd() * 0.06, roll);
        q.setFromAxisAngle(UP, yaw + (rnd() - 0.5) * 0.25);
        q2.setFromAxisAngle(v.set(0, 0, 1), pitch + (rnd() - 0.5) * 0.2);
        q.multiply(q2);
        card.applyMatrix4(m4.compose(v.set(0, y - 0.01 * Math.abs(roll), 0), q, new Vector3(1, 1, 1)));
        cards.push(card);
      }
    }
  }
  // Leader: two crossed vertical cards at the top.
  for (const yaw of [0, Math.PI / 2]) {
    const card = frondCard(0.14, 0.07, 0, 0);
    q.setFromAxisAngle(UP, yaw).multiply(q2.setFromAxisAngle(v.set(0, 0, 1), Math.PI / 2 - 0.05));
    card.applyMatrix4(m4.compose(v.set(0, 0.9, 0), q, new Vector3(1, 1, 1)));
    cards.push(card);
  }
  const fronds = mergeGeometries(cards, false)!;
  for (const c of cards) c.dispose();
  shadeCrown(fronds);

  const trunk = new CylinderGeometry(0.006, 0.032, 1.02, 7, 1, true);
  trunk.translate(0, 0.49, 0);
  const tuv = trunk.attributes.uv!;
  for (let i = 0; i < tuv.count; i++) tuv.setXY(i, tuv.getX(i), tuv.getY(i) * 6);

  const mats = frondMaterials();
  return {
    trunk,
    fronds,
    frondMaterial: mats[seed % mats.length]!,
    trunkMaterial: trunkMaterial(),
    tris: (fronds.index!.count + trunk.index!.count) / 3,
  };
}

/**
 * Crown lighting for frond cards: normals point out from the trunk and up (a rounded crown, so
 * the tree shades like a volume instead of a stack of flat cards), and vertex colours darken the
 * inner, trunk-side end of every branch and the lower crown (self-shadowing inside the foliage).
 */
function shadeCrown(g: BufferGeometry): void {
  const pos = g.attributes.position!;
  const nrm = g.attributes.normal!;
  const col = new Float32Array(pos.count * 3);
  const n = new Vector3();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const r = Math.hypot(x, z);
    n.set(x, 0, z).normalize().multiplyScalar(0.85).add(v.set(0, 0.45 + y * 0.5, 0)).normalize();
    nrm.setXYZ(i, n.x, n.y, n.z);
    const inner = Math.min(1, r / 0.12); // 0 at the trunk, 1 at ~12 cm out (unit tree)
    const shade = (0.42 + 0.58 * inner) * (0.72 + 0.28 * Math.min(1, y * 1.2));
    col[i * 3] = shade;
    col[i * 3 + 1] = shade;
    col[i * 3 + 2] = shade * 0.96;
  }
  g.setAttribute('color', new Float32BufferAttribute(col, 3));
  nrm.needsUpdate = true;
}

/** A dead, bare conifer: tall snag with stubby, mostly broken branches. */
export function buildDeadTree(seed: number): TreeVariant {
  const rnd = rng32(0xdead + seed * 131);
  const parts: BufferGeometry[] = [];
  const trunk = new CylinderGeometry(0.008, 0.03, 1, 6, 1, true);
  trunk.translate(0, 0.5, 0);
  parts.push(trunk);
  for (let i = 0; i < 16; i++) {
    const y = 0.25 + rnd() * 0.65;
    const len = (0.05 + rnd() * 0.16) * (1.1 - y);
    const br = new CylinderGeometry(0.0015, 0.006, len, 4, 1, true);
    br.translate(0, len / 2, 0);
    q.setFromAxisAngle(UP, rnd() * Math.PI * 2).multiply(q2.setFromAxisAngle(v.set(0, 0, 1), -(1.2 + rnd() * 0.6)));
    br.applyMatrix4(m4.compose(v.set(0, y, 0), q, new Vector3(1, 1, 1)));
    parts.push(br);
  }
  const g = mergeGeometries(parts.map((p) => p.toNonIndexed()), false)!;
  const tuv = g.attributes.uv!;
  for (let i = 0; i < tuv.count; i++) tuv.setY(i, tuv.getY(i) * 5);
  return { trunk: g, fronds: null, frondMaterial: null, trunkMaterial: trunkMaterial(), tris: g.attributes.position!.count / 3 };
}

/** Adds instanced meshes for `variant` at every placement (trunk + fronds share transforms). */
export function addTreeInstances(scene: Scene, variant: TreeVariant, placements: readonly TreePlacement[]): void {
  if (placements.length === 0) return;
  const parts: Array<[BufferGeometry, Material]> = [[variant.trunk, variant.trunkMaterial]];
  if (variant.fronds && variant.frondMaterial) parts.push([variant.fronds, variant.frondMaterial]);
  for (const [geo, mat] of parts) {
    const mesh = new InstancedMesh(geo, mat, placements.length);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    for (let i = 0; i < placements.length; i++) {
      const p = placements[i]!;
      q.setFromAxisAngle(UP, p.rotY);
      // Width scales a bit less than height so tall trees stay slender.
      const w = p.height * 0.9;
      mesh.setMatrixAt(i, m4.compose(v.set(p.x, p.y, p.z), q, new Vector3(w, p.height, w)));
      if (p.tint && geo !== variant.trunk) mesh.setColorAt(i, p.tint);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    if (geo !== variant.trunk) excludeFromAO(mesh); // alpha-cut fronds
    scene.add(mesh);
  }
}

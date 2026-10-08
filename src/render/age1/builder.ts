import {
  BufferGeometry,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Matrix4,
  Mesh,
  Quaternion,
  Vector3,
  type Material,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const UP = new Vector3(0, 1, 0);
const tmpA = new Vector3();
const tmpB = new Vector3();
const tmpDir = new Vector3();
const tmpQ = new Quaternion();
const tmpM = new Matrix4();

/** Minimal deterministic RNG (mulberry32) so every structure is reproducible. */
export function rng32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Collects primitive pieces per material and merges them into one mesh per material, so a
 * whole hut or tower is a few draw calls. Geometry is built in the structure's local space
 * (metres, facing +X, origin on the ground).
 */
export class PieceBuilder {
  private readonly buckets = new Map<Material, BufferGeometry[]>();

  add(material: Material, geo: BufferGeometry): this {
    // Normalise attributes so pieces built from different primitives merge cleanly.
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (g !== geo) geo.dispose();
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
    let list = this.buckets.get(material);
    if (!list) this.buckets.set(material, (list = []));
    list.push(g);
    return this;
  }

  /**
   * A round log (or pole) from `a` to `b`. UVs run along the length (U around, V along) with
   * `uvLen` metres per texture repeat. Slight taper by default. Open-ended unless `caps` (ends are
   * usually buried, lashed or hidden under a cone; caps would double the triangle count).
   */
  log(material: Material, a: Vector3, b: Vector3, radius: number, opts: { taper?: number; sides?: number; uvLen?: number; cone?: boolean; caps?: boolean } = {}): this {
    const len = tmpDir.subVectors(b, a).length();
    const sides = opts.sides ?? 7;
    const geo = opts.cone
      ? new ConeGeometry(radius, len, sides, 1, true)
      : new CylinderGeometry(radius * (opts.taper ?? 0.85), radius, len, sides, 1, !opts.caps);
    const uvLen = opts.uvLen ?? 2;
    const uv = geo.attributes.uv!;
    for (let i = 0; i < uv.count; i++) uv.setY(i, (uv.getY(i) * len) / uvLen);
    geo.translate(0, len / 2, 0);
    tmpQ.setFromUnitVectors(UP, tmpDir.normalize());
    tmpM.compose(a, tmpQ, tmpA.set(1, 1, 1));
    geo.applyMatrix4(tmpM);
    return this.add(material, geo);
  }

  /** A vertical log from ground point (x, z) up to height h, leaning a little. */
  post(material: Material, x: number, z: number, h: number, r: number, lean: Vector3 = tmpB.set(0, 0, 0), opts: { cone?: boolean; sides?: number } = {}): this {
    return this.log(material, new Vector3(x, -0.15, z), new Vector3(x + lean.x, h, z + lean.z), r, { taper: 0.8, ...opts });
  }

  /** Place an arbitrary geometry with a transform. */
  place(material: Material, geo: BufferGeometry, pos: Vector3, rotY = 0, scale: Vector3 = new Vector3(1, 1, 1), rot?: Quaternion): this {
    const q = rot ?? tmpQ.setFromAxisAngle(UP, rotY);
    geo.applyMatrix4(tmpM.compose(pos, q, scale));
    return this.add(material, geo);
  }

  /** Merge everything into a Group (one mesh per material). */
  build(opts: { castShadow?: boolean; receiveShadow?: boolean } = {}): Group {
    const g = new Group();
    for (const [mat, list] of this.buckets) {
      const merged = mergeGeometries(list, false);
      for (const p of list) p.dispose();
      if (!merged) continue;
      merged.computeBoundingSphere();
      const mesh = new Mesh(merged, mat);
      mesh.castShadow = opts.castShadow ?? true;
      mesh.receiveShadow = opts.receiveShadow ?? true;
      mesh.name = mat.name;
      g.add(mesh);
    }
    this.buckets.clear();
    return g;
  }
}

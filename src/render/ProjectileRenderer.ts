import {
  BoxGeometry,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  Vector3,
  type Scene,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Projectile } from '../sim/Projectile';

const CAPACITY = 2048;
const UNIT_X = new Vector3(1, 0, 0);
/** Projectile `size` that renders the arrow at its authored 1 m length. */
const SIZE_FOR_1M = 0.12;

/**
 * Age 1 arrow, 1 m long along +X, centred: wooden shaft, knapped stone head, two crossed
 * feather fletchings. Vertex-coloured, one geometry for every projectile (the turret's giant
 * arrow is the same shape scaled up by its larger `size`). Exaggerated thickness so arrows read
 * at battle-camera distance.
 */
export function createArrowGeometry(): BufferGeometry {
  const colored = (g: BufferGeometry, hex: number): BufferGeometry => {
    const ng = g.index ? g.toNonIndexed() : g;
    const c = new Color(hex);
    const n = ng.attributes.position!.count;
    const cols = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) c.toArray(cols, i * 3);
    ng.setAttribute('color', new Float32BufferAttribute(cols, 3));
    for (const name of Object.keys(ng.attributes)) if (!['position', 'normal', 'color'].includes(name)) ng.deleteAttribute(name);
    return ng;
  };
  const shaft = new CylinderGeometry(0.022, 0.022, 0.82, 5);
  shaft.rotateZ(-Math.PI / 2);
  shaft.translate(-0.04, 0, 0);
  const head = new ConeGeometry(0.06, 0.16, 4);
  head.rotateZ(-Math.PI / 2);
  head.translate(0.42, 0, 0);
  const parts = [colored(shaft, 0xb08a5a), colored(head, 0x5d5a55)];
  for (const roll of [0, Math.PI / 2]) {
    const f = new PlaneGeometry(0.2, 0.09);
    f.rotateX(roll);
    f.translate(-0.36, 0, 0);
    parts.push(colored(f, 0xe8e2d4));
  }
  const nock = new BoxGeometry(0.03, 0.04, 0.04);
  nock.translate(-0.46, 0, 0);
  parts.push(colored(nock, 0x3a2a1c));
  return mergeGeometries(parts, false)!;
}

/** Draws every in-flight projectile with a single instanced mesh; no per-frame allocation. */
export class ProjectileRenderer {
  private readonly mesh: InstancedMesh;
  private readonly m = new Matrix4();
  private readonly q = new Quaternion();
  private readonly pos = new Vector3();
  private readonly dir = new Vector3();
  private readonly scl = new Vector3();
  private readonly color = new Color();

  constructor(scene: Scene) {
    const mat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: DoubleSide });
    this.mesh = new InstancedMesh(createArrowGeometry(), mat, CAPACITY);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    this.mesh.setColorAt(0, this.color.set(0xffffff)); // allocates instanceColor once
    scene.add(this.mesh);
  }

  update(projectiles: readonly Projectile[]): void {
    const n = Math.min(projectiles.length, CAPACITY);
    for (let i = 0; i < n; i++) {
      const p = projectiles[i]!;
      this.dir.set(p.vx, p.vy, p.vz);
      if (this.dir.lengthSq() > 1e-6) this.q.setFromUnitVectors(UNIT_X, this.dir.normalize());
      const s = p.def.size / SIZE_FOR_1M;
      this.m.compose(this.pos.set(p.x, p.y, p.z), this.q, this.scl.set(s, s, s));
      this.mesh.setMatrixAt(i, this.m);
      this.mesh.setColorAt(i, this.color.setHex(p.def.color));
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

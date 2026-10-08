import {
  BufferGeometry,
  Color,
  DodecahedronGeometry,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  SphereGeometry,
  Vector3,
  type Scene,
} from 'three';
import type { ProjectileDef } from '../config/schema';
import type { Projectile } from '../sim/Projectile';
import { pathCenterZ } from './terrain';

const CAPACITY = 1024;
const UNIT_X = new Vector3(1, 0, 0);
const UNIT_Z = new Vector3(0, 0, 1);

type Shape = ProjectileDef['shape'];

/** Unit-diameter geometry per projectile shape (scaled by `def.size`, coloured per instance). */
function shapeGeometry(shape: Shape): BufferGeometry {
  switch (shape) {
    case 'egg': {
      const g = new SphereGeometry(0.5, 10, 8);
      g.scale(1.25, 1, 1); // long axis along flight (+X)
      return g;
    }
    case 'boulder':
      return new DodecahedronGeometry(0.5, 0);
    default:
      return new IcosahedronGeometry(0.5, 0);
  }
}

/**
 * Draws every in-flight projectile, one instanced mesh per shape (stone, egg, boulder); no
 * per-frame allocation. Projectiles are oriented along their velocity and spin a little.
 */
export class ProjectileRenderer {
  private readonly meshes = new Map<Shape, InstancedMesh>();
  private readonly counts = new Map<Shape, number>();
  private readonly m = new Matrix4();
  private readonly q = new Quaternion();
  private readonly spin = new Quaternion();
  private readonly pos = new Vector3();
  private readonly dir = new Vector3();
  private readonly scl = new Vector3();
  private readonly color = new Color();

  constructor(scene: Scene) {
    const mat = new MeshStandardMaterial({ roughness: 0.9, flatShading: true });
    for (const shape of ['stone', 'egg', 'boulder'] as const) {
      const mesh = new InstancedMesh(shapeGeometry(shape), shape === 'egg' ? new MeshStandardMaterial({ roughness: 0.55 }) : mat, CAPACITY);
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.castShadow = true;
      mesh.setColorAt(0, this.color.set(0xffffff)); // allocates instanceColor once
      scene.add(mesh);
      this.meshes.set(shape, mesh);
    }
  }

  update(projectiles: readonly Projectile[]): void {
    for (const k of this.meshes.keys()) this.counts.set(k, 0);
    for (const p of projectiles) {
      const mesh = this.meshes.get(p.def.shape) ?? this.meshes.get('stone')!;
      const shape = mesh === this.meshes.get(p.def.shape) ? p.def.shape : 'stone';
      const i = this.counts.get(shape)!;
      if (i >= CAPACITY) continue;
      this.dir.set(p.vx, p.vy, p.vz);
      if (this.dir.lengthSq() > 1e-6) this.q.setFromUnitVectors(UNIT_X, this.dir.normalize());
      if (shape !== 'egg') this.q.multiply(this.spin.setFromAxisAngle(UNIT_Z, p.age * 9));
      const s = p.def.size;
      this.m.compose(this.pos.set(p.x, p.y, p.z + pathCenterZ(p.x)), this.q, this.scl.set(s, s, s));
      mesh.setMatrixAt(i, this.m);
      mesh.setColorAt(i, this.color.setHex(p.def.color));
      this.counts.set(shape, i + 1);
    }
    for (const [shape, mesh] of this.meshes) {
      mesh.count = this.counts.get(shape)!;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }
}

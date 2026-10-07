import {
  BoxGeometry,
  Color,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  Quaternion,
  Vector3,
  type Scene,
} from 'three';
import type { Projectile } from '../sim/Projectile';

const CAPACITY = 2048;
const UNIT_X = new Vector3(1, 0, 0);

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
    this.mesh = new InstancedMesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial(), CAPACITY);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.setColorAt(0, this.color.set(0xffffff)); // allocates instanceColor once
    scene.add(this.mesh);
  }

  update(projectiles: readonly Projectile[]): void {
    const n = Math.min(projectiles.length, CAPACITY);
    for (let i = 0; i < n; i++) {
      const p = projectiles[i]!;
      this.dir.set(p.vx, p.vy, p.vz);
      if (this.dir.lengthSq() > 1e-6) this.q.setFromUnitVectors(UNIT_X, this.dir.normalize());
      const s = p.def.size;
      this.m.compose(this.pos.set(p.x, p.y, p.z), this.q, this.scl.set(s * 4, s, s));
      this.mesh.setMatrixAt(i, this.m);
      this.mesh.setColorAt(i, this.color.setHex(p.def.color));
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

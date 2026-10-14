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
import { rockGeometry, STONE_VARIANTS, stoneLook, stoneRotation, type StoneLook } from './stoneShapes';
import { pathCenterZ, terrainHeight } from './terrain';

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
 * Draws every in-flight projectile with instanced meshes; no per-frame allocation. Stones (sling
 * stones, turret rocks) use one of STONE_VARIANTS irregular rock meshes with their own proportions
 * and tumble (stoneShapes.ts, seeded by projectile id, the same look they keep once landed); eggs
 * and boulders fly along their velocity.
 */
export class ProjectileRenderer {
  private readonly meshes = new Map<string, InstancedMesh>();
  private readonly counts = new Map<string, number>();
  private readonly looks = new Map<number, StoneLook>();
  private readonly seen = new Set<number>();
  private readonly m = new Matrix4();
  private readonly q = new Quaternion();
  private readonly spin = new Quaternion();
  private readonly pos = new Vector3();
  private readonly dir = new Vector3();
  private readonly scl = new Vector3();
  private readonly color = new Color();

  constructor(scene: Scene) {
    const mat = new MeshStandardMaterial({ roughness: 0.9, flatShading: true });
    const add = (key: string, geo: BufferGeometry, material: MeshStandardMaterial) => {
      const mesh = new InstancedMesh(geo, material, CAPACITY);
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.castShadow = true;
      mesh.setColorAt(0, this.color.set(0xffffff)); // allocates instanceColor once
      scene.add(mesh);
      this.meshes.set(key, mesh);
    };
    for (let v = 0; v < STONE_VARIANTS; v++) add(`stone${v}`, rockGeometry(v), mat);
    add('egg', shapeGeometry('egg'), new MeshStandardMaterial({ roughness: 0.55 }));
    add('boulder', shapeGeometry('boulder'), mat);
  }

  update(projectiles: readonly Projectile[]): void {
    for (const k of this.meshes.keys()) this.counts.set(k, 0);
    this.seen.clear();
    for (const p of projectiles) {
      const s = p.def.size;
      let key: string = p.def.shape;
      if (p.def.shape === 'stone') {
        let look = this.looks.get(p.id);
        if (!look) this.looks.set(p.id, (look = stoneLook(p.id)));
        this.seen.add(p.id);
        key = `stone${look.variant}`;
        stoneRotation(look, p.age, this.q);
        this.scl.copy(look.scale).multiplyScalar(s);
      } else {
        this.dir.set(p.vx, p.vy, p.vz);
        if (this.dir.lengthSq() > 1e-6) this.q.setFromUnitVectors(UNIT_X, this.dir.normalize());
        if (p.def.shape !== 'egg') this.q.multiply(this.spin.setFromAxisAngle(UNIT_Z, p.age * 9));
        this.scl.set(s, s, s);
      }
      const mesh = this.meshes.get(key) ?? this.meshes.get('stone0')!;
      const i = this.counts.get(key) ?? 0;
      if (i >= CAPACITY) continue;
      // Sim heights are above the local ground, like the units standing on the terrain.
      const z = p.z + pathCenterZ(p.x);
      this.m.compose(this.pos.set(p.x, p.y + terrainHeight(p.x, z), z), this.q, this.scl);
      mesh.setMatrixAt(i, this.m);
      mesh.setColorAt(i, this.color.setHex(p.def.color));
      this.counts.set(key, i + 1);
    }
    for (const id of this.looks.keys()) if (!this.seen.has(id)) this.looks.delete(id);
    for (const [key, mesh] of this.meshes) {
      mesh.count = this.counts.get(key)!;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }
}

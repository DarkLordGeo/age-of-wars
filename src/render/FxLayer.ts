import { Mesh, MeshBasicMaterial, SphereGeometry, type Scene } from 'three';
import type { EventBus } from '../game/EventBus';

const POOL = 64;
const LIFE = 0.28;

interface Puff {
  mesh: Mesh;
  life: number;
  size: number;
}

/** Placeholder effects: pooled expanding blobs on hits, misses and deaths. */
export class FxLayer {
  private readonly puffs: Puff[] = [];
  private cursor = 0;
  private readonly hitMat = new MeshBasicMaterial({ color: 0xffd36b });
  private readonly missMat = new MeshBasicMaterial({ color: 0xb8a98a });
  private readonly deathMat = new MeshBasicMaterial({ color: 0xff5a4a });

  constructor(scene: Scene, bus: EventBus) {
    const geo = new SphereGeometry(1, 8, 6);
    for (let i = 0; i < POOL; i++) {
      const mesh = new Mesh(geo, this.hitMat);
      mesh.visible = false;
      scene.add(mesh);
      this.puffs.push({ mesh, life: 0, size: 1 });
    }
    bus.on('hit', (e) => this.spawn(e.x, e.y, e.z, this.hitMat, e.targetKind === 'base' ? 0.7 : 0.35));
    bus.on('projectileImpact', (e) => !e.hit && this.spawn(e.x, 0.1, e.z, this.missMat, 0.25));
  }

  /** Death puff; the renderer calls this because only it can map a unit id to a position. */
  deathAt(x: number, z: number): void {
    this.spawn(x, 0.8, z, this.deathMat, 0.6);
  }

  update(dt: number): void {
    for (const p of this.puffs) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.mesh.visible = false;
        continue;
      }
      p.mesh.scale.setScalar(p.size * (1 - p.life / LIFE) + 0.05);
    }
  }

  private spawn(x: number, y: number, z: number, mat: MeshBasicMaterial, size: number): void {
    const p = this.puffs[this.cursor++ % POOL]!;
    p.life = LIFE;
    p.size = size;
    p.mesh.material = mat;
    p.mesh.position.set(x, y, z);
    p.mesh.scale.setScalar(0.05);
    p.mesh.visible = true;
  }
}

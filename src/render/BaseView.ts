import { Group, type Object3D } from 'three';
import type { AssetLibrary } from '../assets/AssetLibrary';
import type { Base } from '../sim/Base';
import { teamDir } from '../sim/types';

const SHAKE_TIME = 0.25;
const RECOIL_TIME = 0.18;

/** Base building plus its turret models. Shakes when hit, recoils turrets when they fire. */
export class BaseView {
  readonly root = new Group();
  private readonly turretModels: Array<{ key: string; obj: Object3D; recoil: number }> = [];
  private shake = 0;

  constructor(
    private readonly assets: AssetLibrary,
    private readonly tint: number,
    private base: Base,
  ) {
    const model = assets.instantiate('base.keep', tint);
    // Models face +X; the enemy base faces the other way.
    model.rotation.y = teamDir(base.team) === 1 ? 0 : Math.PI;
    this.root.add(model);
    this.root.position.set(base.x, 0, 0);
  }

  rebind(base: Base): void {
    this.base = base;
    this.shake = 0;
    this.root.position.set(base.x, 0, 0);
  }

  triggerShake(): void {
    this.shake = SHAKE_TIME;
  }

  triggerRecoil(turretIndex: number): void {
    const t = this.turretModels[turretIndex];
    if (t) t.recoil = RECOIL_TIME;
  }

  update(dt: number): void {
    // (Re)build turret models when the sim's turret set changes, e.g. on age advance.
    const turrets = this.base.turrets;
    for (let i = 0; i < turrets.length; i++) {
      const t = turrets[i]!;
      const have = this.turretModels[i];
      if (have?.key === t.def.modelKey) continue;
      if (have) this.root.remove(have.obj);
      const obj = this.assets.instantiate(t.def.modelKey, this.tint);
      obj.position.set(t.x - this.base.x, 0, t.z);
      obj.rotation.y = teamDir(this.base.team) === 1 ? 0 : Math.PI;
      this.root.add(obj);
      this.turretModels[i] = { key: t.def.modelKey, obj, recoil: 0 };
    }

    const dir = teamDir(this.base.team);
    for (let i = 0; i < this.turretModels.length; i++) {
      const t = this.turretModels[i]!;
      t.recoil = Math.max(0, t.recoil - dt);
      const kick = Math.sin((t.recoil / RECOIL_TIME) * Math.PI) * 0.3;
      t.obj.position.x = turrets[i]!.x - this.base.x - dir * kick;
    }

    this.shake = Math.max(0, this.shake - dt);
    const s = this.shake / SHAKE_TIME;
    this.root.position.x = this.base.x + Math.sin(this.shake * 90) * 0.25 * s;
  }
}

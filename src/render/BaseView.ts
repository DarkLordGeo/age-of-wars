import { Group, type Object3D } from 'three';
import type { AssetLibrary } from '../assets/AssetLibrary';
import type { Base } from '../sim/Base';
import { teamDir } from '../sim/types';

const SHAKE_TIME = 0.25;
const RECOIL_TIME = 0.18;
/** How long the turret's nocked arrow stays hidden after a shot (visual reload). */
const RELOAD_SHOW_AFTER = 0.75;

interface TurretModel {
  key: string;
  obj: Object3D;
  /** The recoiling part ("Weapon" child); the whole model when the model has none. */
  weapon: Object3D;
  weaponRestX: number;
  nocked: Object3D | null;
  recoil: number;
  reload: number;
}

type Ticking = Object3D & { userData: { tick?: (dt: number) => void } };

/**
 * Base building plus its turret models. Shakes when hit, recoils turrets when they fire, and
 * ticks animated parts (campfire, banners) that models expose as `userData.tick(dt)`.
 */
export class BaseView {
  readonly root = new Group();
  private readonly turretModels: TurretModel[] = [];
  private readonly model: Ticking;
  private shake = 0;

  constructor(
    private readonly assets: AssetLibrary,
    private readonly tint: number,
    private base: Base,
  ) {
    this.model = assets.instantiate('base.keep', tint) as Ticking;
    // Models face +X. The enemy base is mirrored (not rotated) so the low, open side of the
    // camp keeps facing the camera (+Z) for both teams. Three.js flips winding for det < 0.
    if (teamDir(base.team) === -1) this.model.scale.x = -1;
    this.root.add(this.model);
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
    if (!t) return;
    t.recoil = RECOIL_TIME;
    t.reload = RELOAD_SHOW_AFTER;
    if (t.nocked) t.nocked.visible = false;
  }

  update(dt: number): void {
    this.model.userData.tick?.(dt);

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
      const weapon = obj.getObjectByName('Weapon') ?? obj;
      this.turretModels[i] = {
        key: t.def.modelKey,
        obj,
        weapon,
        weaponRestX: weapon.position.x,
        nocked: weapon === obj ? null : (weapon.getObjectByName('NockedArrow') ?? null),
        recoil: 0,
        reload: 0,
      };
    }

    for (let i = 0; i < this.turretModels.length; i++) {
      const t = this.turretModels[i]!;
      t.recoil = Math.max(0, t.recoil - dt);
      if (t.reload > 0) {
        t.reload = Math.max(0, t.reload - dt);
        if (t.reload === 0 && t.nocked) t.nocked.visible = true;
      }
      const kick = Math.sin((t.recoil / RECOIL_TIME) * Math.PI) * 0.3;
      if (t.weapon === t.obj) {
        // Whole-model kick, in base space (toward our own side).
        t.obj.position.x = turrets[i]!.x - this.base.x - teamDir(this.base.team) * kick;
      } else {
        // Weapon kick in the turret's local space (the model is already turned to face the enemy).
        t.weapon.position.x = t.weaponRestX - kick;
      }
      t.obj.userData.tick?.(dt);
    }

    this.shake = Math.max(0, this.shake - dt);
    const s = this.shake / SHAKE_TIME;
    this.root.position.x = this.base.x + Math.sin(this.shake * 90) * 0.25 * s;
  }
}

import { Group, type Object3D } from 'three';
import type { AssetLibrary } from '../assets/AssetLibrary';
import type { Base } from '../sim/Base';
import { teamDir } from '../sim/types';
import { GAME } from '../config/game';
import { createSlotTower, TURRET_MUZZLE } from './age1/turrets';

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
 * Base building plus its turret models. Recoils turrets when they fire, and
 * ticks animated parts (campfire, banners) that models expose as `userData.tick(dt)`.
 */
export class BaseView {
  readonly root = new Group();
  private readonly turretModels: Array<TurretModel | undefined> = [];
  private tower: Object3D | null = null;
  private towerSlots = 0;
  private readonly model: Ticking;

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
    this.root.position.set(base.x, 0, 0);
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
    const base = this.base;
    const dir = teamDir(base.team);
    const towerX = dir * GAME.turretTower.forward;
    const towerZ = GAME.turretTower.side;

    // Slot tower: rebuilt when a slot is bought.
    if (this.towerSlots !== base.slots) {
      if (this.tower) this.root.remove(this.tower);
      this.tower = createSlotTower(this.tint, base.slots);
      this.tower.position.set(towerX, 0, towerZ);
      if (dir === -1) this.tower.scale.x = -1;
      this.root.add(this.tower);
      this.towerSlots = base.slots;
    }

    // Turret models follow the sim's slots (null = empty).
    const turrets = base.turrets;
    for (let i = 0; i < turrets.length; i++) {
      const t = turrets[i];
      const have = this.turretModels[i];
      if (have && have.key === t?.def.modelKey) continue;
      if (have) this.root.remove(have.obj);
      this.turretModels[i] = undefined;
      if (!t) continue;
      const obj = this.assets.instantiate(t.def.modelKey, this.tint);
      obj.position.set(t.x - base.x, t.y - TURRET_MUZZLE, t.z);
      obj.rotation.y = dir === 1 ? 0 : Math.PI;
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

    for (const t of this.turretModels) {
      if (!t) continue;
      t.recoil = Math.max(0, t.recoil - dt);
      if (t.reload > 0) {
        t.reload = Math.max(0, t.reload - dt);
        if (t.reload === 0 && t.nocked) t.nocked.visible = true;
      }
      t.weapon.position.x = t.weaponRestX - Math.sin((t.recoil / RECOIL_TIME) * Math.PI) * 0.3;
      t.obj.userData.tick?.(dt);
    }
  }
}

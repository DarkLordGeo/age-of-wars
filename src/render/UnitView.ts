import { Group, Mesh, MeshBasicMaterial, PlaneGeometry, type AnimationClip, type Camera, type Object3D } from 'three';
import type { ClipName } from '../assets/contract';
import type { Unit } from '../sim/Unit';
import { teamDir } from '../sim/types';
import { ModelAnimator } from './ModelAnimator';
import { excludeFromAO } from './post';

const LUNGE_TIME = 0.22;
const barBg = new MeshBasicMaterial({ color: 0x000000, depthTest: false, transparent: true, opacity: 0.6 });
const barFg = new MeshBasicMaterial({ color: 0x4ade80, depthTest: false });
const barGeo = new PlaneGeometry(1, 1);
const BAR_W = 1.2;
const BAR_H = 0.14;

/**
 * Visual mirror of one sim Unit: positions a model, animates it, shows a health bar.
 * Views are pooled; `bind` re-targets a released view at a new unit.
 *
 * Animated GLBs are driven by contract clips (idle/walk/attack/death) chosen from the
 * unit's sim state; placeholder models fall back to a procedural bob/lunge/fall.
 */
export class UnitView {
  readonly root = new Group();
  unit!: Unit;
  /** Frame stamp used by the renderer to detect views whose unit disappeared. */
  seen = 0;
  private readonly bar = new Group();
  private readonly fill: Mesh;
  private lunge = 0;
  private phase = Math.random() * 10;
  /** Present only for models that ship contract clips. */
  readonly animator: ModelAnimator | null;

  constructor(
    readonly poolKey: string,
    private readonly model: Object3D,
    clips: ReadonlyMap<ClipName, AnimationClip>,
  ) {
    this.animator = clips.size > 0 ? new ModelAnimator(model, clips) : null;
    this.root.add(model);
    const bg = new Mesh(barGeo, barBg);
    bg.scale.set(BAR_W, BAR_H, 1);
    bg.renderOrder = 10;
    this.fill = new Mesh(barGeo, barFg);
    this.fill.renderOrder = 11;
    this.bar.add(bg, this.fill);
    excludeFromAO(this.bar);
    this.root.add(this.bar);
  }

  bind(unit: Unit): void {
    this.unit = unit;
    // Models are authored facing +X; mirror for the team marching toward -X.
    this.model.rotation.set(0, teamDir(unit.team) === 1 ? 0 : Math.PI, 0);
    this.model.position.set(0, 0, 0);
    this.bar.position.y = unit.def.height + 0.6;
    this.lunge = 0;
    this.root.visible = true;
    this.animator?.reset();
    this.animator?.playLoop('idle');
    this.update(0, null);
  }

  triggerAttack(): void {
    if (this.animator) this.animator.playOnce('attack');
    else this.lunge = LUNGE_TIME;
  }

  update(dt: number, camera: Camera | null): void {
    const u = this.unit;
    const dir = teamDir(u.team);
    this.root.position.set(u.centerX(dir), 0, u.z);
    this.phase += dt * 9;

    if (this.animator) {
      this.animator.update(dt);
      if (u.state === 'dead') this.animator.playOnce('death');
      else if (u.moving) this.animator.playLoop('walk');
      else this.animator.playLoop('idle');
    } else {
      this.animateProcedurally(dt, dir);
    }
    if (u.state === 'dead') {
      this.bar.visible = false;
      return;
    }

    const frac = Math.max(0, u.health / u.maxHealth);
    this.bar.visible = frac < 1;
    if (this.bar.visible) {
      this.fill.scale.set(BAR_W * frac, BAR_H, 1);
      this.fill.position.x = -(BAR_W / 2) * (1 - frac);
      if (camera) this.bar.quaternion.copy(camera.quaternion);
    }
  }

  /** Stand-in animation for placeholder models that have no clips. */
  private animateProcedurally(dt: number, dir: 1 | -1): void {
    const u = this.unit;
    const m = this.model;
    m.position.set(0, 0, 0);
    m.rotation.z = 0;
    if (u.state === 'dead') {
      const t = Math.min(1, u.deadFor / 0.5);
      m.rotation.z = -dir * t * (Math.PI / 2);
      m.position.y = -0.1 * t;
      return;
    }
    m.userData.animate?.(this.phase, u.moving);
    if (u.moving && !m.userData.animate) {
      m.position.y = Math.abs(Math.sin(this.phase)) * 0.12;
      m.rotation.z = Math.sin(this.phase) * 0.04;
    }
    if (this.lunge > 0) {
      this.lunge = Math.max(0, this.lunge - dt);
      m.position.x = dir * Math.sin((this.lunge / LUNGE_TIME) * Math.PI) * 0.45;
    }
  }
}

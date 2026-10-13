import { Box3, Group, Mesh, MeshBasicMaterial, PlaneGeometry, type AnimationClip, type Camera, type Object3D } from 'three';
import type { ClipName } from '../assets/contract';
import { GAME } from '../config/game';
import { createRng } from '../sim/rng';
import type { Unit } from '../sim/Unit';
import { opposite, teamDir } from '../sim/types';
import type { World } from '../sim/World';
import { lowestPoint } from './grounding';
import { pathCenterZ, pathSlope, terrainHeight } from './terrain';
import { ModelAnimator } from './ModelAnimator';
import { excludeFromAO } from './post';

const LUNGE_TIME = 0.32;
const barBg = new MeshBasicMaterial({ color: 0x000000, depthTest: false, transparent: true, opacity: 0.6 });
const barFg = new MeshBasicMaterial({ color: 0x4ade80, depthTest: false });
const barGeo = new PlaneGeometry(1, 1);
const BAR_W = 1.2;
const BAR_H = 0.14;

/** Render-only melee presentation (the sim's ranges and gaps are the original game's). */
export const MELEE_VISUALS = {
  /**
   * Gap (m) left between two fighters' bind-pose fronts: the attack clips lean and step into
   * it, so at ~1.2 m the club meets the opponent without the bodies clinching.
   */
  gap: 1.2,
  /** How fast fighters close the gap / step back (1/s). */
  engageRate: 6,
  /** Knock-back (m) when struck, and its recovery rate (1/s). */
  knock: 0.1,
  knockRecovery: 9,
  /** Per-unit spread of loop speed (idle/walk) and swing speed: +-5 % / +-8 %. */
  loopRateJitter: 0.05,
  swingRateJitter: 0.08,
};
/** Each fighter steps this far forward from its sim front (half of the excess gap). */
export const MELEE_STEP = Math.max(0, (GAME.minUnitGap - MELEE_VISUALS.gap) / 2);

/** Turning toward a target: max rate (rad/s), and the distance below which it holds its heading. */
export const FACING = { turnRate: 7, holdWithin: 0.3 };

/** Smallest signed angle from a to b (radians). */
function angleTo(a: number, b: number): number {
  return Math.atan2(Math.sin(b - a), Math.cos(b - a));
}

/** Model yaw that turns its +X forward axis toward (dx, dz) (three.js: +yaw turns +X toward -Z). */
export function yawToward(dx: number, dz: number): number {
  return Math.atan2(-dz, dx);
}

/**
 * Where an attacking unit should look: the enemy team's front unit (the one the sim makes it
 * fight), or the enemy base when no enemy unit is left. `drawnAt` gives a unit's drawn position
 * (its view), falling back to the sim lane position. Null when the unit is not attacking.
 */
export function combatTarget(world: World, unit: Unit, drawnAt: (u: Unit) => { x: number; z: number } | undefined): { x: number; z: number } | null {
  if (unit.state !== 'attacking') return null;
  const foes = world.alive[opposite(unit.team)];
  const front = unit.team === 'player' ? foes[0] : foes[foes.length - 1];
  if (front) return drawnAt(front) ?? { x: front.x, z: front.z };
  return { x: world.bases[opposite(unit.team)].x, z: 0 };
}

export interface UnitViewOptions {
  variants?: ReadonlyMap<ClipName, readonly AnimationClip[]>;
  /**
   * Seconds into the attack clip where the blow lands; the swing is started this long before
   * the sim applies the damage, so the hit and the strike frame coincide.
   */
  strike?: number;
  /** Called when a strike-synced swing starts (swing whoosh). */
  onSwing?: (unit: Unit) => void;
}

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
  private phase = 0;
  /** How far the model reaches ahead of its origin (m): its visual front. */
  private readonly reach: number;
  private engage = 0;
  private knock = 0;
  private swingRate = 1;
  /** True until the swing for the current melee timer cycle has started. */
  private swingArmed = true;
  /** Current heading (model yaw) and where to look while fighting (null: face the way it walks). */
  private yaw = 0;
  private target: { x: number; z: number } | null = null;
  /** Present only for models that ship contract clips. */
  readonly animator: ModelAnimator | null;

  constructor(
    readonly poolKey: string,
    private readonly model: Object3D,
    clips: ReadonlyMap<ClipName, AnimationClip>,
    private readonly opts: UnitViewOptions = {},
  ) {
    this.animator = clips.size > 0 ? new ModelAnimator(model, clips, opts.variants) : null;
    model.updateMatrixWorld(true);
    this.reach = Math.max(0, new Box3().setFromObject(model).max.x);
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
    this.engage = 0;
    this.knock = 0;
    this.swingArmed = true;
    this.target = null;
    this.yaw = Number.NaN; // snap to the first heading
    // Stable per-unit variation (seeded by the unit id): units of one type never move in lockstep.
    const rng = createRng(unit.id * 9973 + 17);
    const spread = (j: number): number => 1 + (rng() * 2 - 1) * j;
    this.phase = rng() * 10;
    this.swingRate = spread(MELEE_VISUALS.swingRateJitter);
    this.root.visible = true;
    this.animator?.reset();
    this.animator?.vary({ loopRate: spread(MELEE_VISUALS.loopRateJitter), attackRate: this.swingRate, random: rng });
    this.animator?.playLoop('idle');
    this.update(0, null);
  }

  triggerAttack(): void {
    if (this.animator) this.animator.playOnce('attack');
    else this.lunge = LUNGE_TIME;
  }

  /** Struck: a small knock-back, and a flinch on models with a `hit` clip (never cuts a swing). */
  triggerHit(): void {
    if (this.unit.state === 'dead') return;
    this.knock = MELEE_VISUALS.knock;
    this.animator?.playOnce('hit');
  }

  /** Look at this point while attacking (set each frame by the renderer; null when not fighting). */
  setTarget(target: { x: number; z: number } | null): void {
    this.target = target;
  }

  /** Current model yaw (radians). */
  get heading(): number {
    return this.yaw;
  }

  /** Lane x where the model is drawn: its visual front on the sim front, plus melee step/knock. */
  drawX(): number {
    const u = this.unit;
    const dir = teamDir(u.team);
    return u.x - dir * (this.reach - this.engage + this.knock);
  }

  update(dt: number, camera: Camera | null): void {
    const u = this.unit;
    const dir = teamDir(u.team);
    // Fighters in melee step into the gap the sim keeps between fronts, so blows connect.
    const inMelee = u.state === 'attacking' && u.meleeTimer !== null;
    const k = 1 - Math.exp(-MELEE_VISUALS.engageRate * dt);
    if (u.state !== 'dead') this.engage += ((inMelee ? MELEE_STEP : 0) - this.engage) * k;
    this.knock *= Math.exp(-MELEE_VISUALS.knockRecovery * dt);
    // The sim lane is straight; draw units on the meandering footpath and face along it.
    const x = this.drawX();
    const z = u.z + pathCenterZ(x);
    const ground = terrainHeight(x, z);
    this.root.position.set(x, ground, z);
    this.turn(dt, x, z, dir);
    this.phase += dt * 9;

    if (this.animator) {
      this.animator.update(dt);
      this.syncSwing();
      if (u.state === 'dead') this.animator.playOnce('death');
      else if (u.moving) this.animator.playLoop('walk');
      else this.animator.playLoop('idle');
    } else {
      this.animateProcedurally(dt, dir);
    }
    if (u.state === 'dead') {
      // Whatever a death animation does (falls, rolls, root motion), its lowest posed point
      // rests on the ground: no sinking through the terrain, no floating corpses.
      this.bar.visible = false; // (and out of the lowest-point test)
      this.root.position.y += ground - lowestPoint(this.root);
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

  /**
   * Heading: along the footpath while moving; toward the target while attacking (so fighters face
   * each other even when the lane's sideways spread puts them off-axis, e.g. beside a cave).
   * Turns at FACING.turnRate, never snaps (except the first frame) and holds its heading when the
   * target is too close to define a direction, so it cannot oscillate. Corpses keep their heading.
   */
  private turn(dt: number, x: number, z: number, dir: 1 | -1): void {
    if (this.unit.state === 'dead') return;
    let want = (dir === 1 ? 0 : Math.PI) - Math.atan(pathSlope(x));
    if (this.target) {
      const dx = this.target.x - x;
      const dz = this.target.z - z;
      // Never turn to face backwards: the sim's target is always ahead along the lane.
      if (Math.hypot(dx, dz) > FACING.holdWithin && dx * dir > 0) want = yawToward(dx, dz);
      else if (Math.hypot(dx, dz) <= FACING.holdWithin && !Number.isNaN(this.yaw)) want = this.yaw;
    }
    if (Number.isNaN(this.yaw) || dt <= 0) {
      if (Number.isNaN(this.yaw)) this.yaw = want;
    } else {
      const step = FACING.turnRate * dt;
      const d = angleTo(this.yaw, want);
      this.yaw += Math.max(-step, Math.min(step, d));
    }
    this.model.rotation.y = this.yaw;
  }

  /**
   * Start the attack clip `strike / swingRate` seconds before the sim's next melee hit or
   * ranged shot, so the blow lands / the stone leaves on that tick. Visual only: the sim's
   * timers and damage are untouched.
   */
  private syncSwing(): void {
    const u = this.unit;
    const strike = this.opts.strike;
    const melee = u.meleeTimer !== null;
    const timer = melee ? u.meleeTimer : u.def.ranged ? u.rangedTimer : null;
    if (strike === undefined || !this.animator || u.state === 'dead' || timer === null) {
      this.swingArmed = true;
      return;
    }
    const lead = strike / this.swingRate;
    if (timer > lead + 1e-6) {
      this.swingArmed = true;
    } else if (this.swingArmed) {
      this.swingArmed = false;
      if (this.animator.playOnce('attack') && melee) this.opts.onSwing?.(u);
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
      m.rotation.z = -dir * t * (Math.PI / 2); // grounded by update()
      return;
    }
    m.userData.animate?.(this.phase, u.moving, this.lunge > 0 ? 1 - this.lunge / LUNGE_TIME : 0);
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

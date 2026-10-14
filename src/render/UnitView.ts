import { Box3, Group, Mesh, MeshBasicMaterial, PlaneGeometry, type AnimationClip, type Camera, type Object3D } from 'three';
import type { Locomotion } from '../assets/AssetLibrary';
import type { ClipName } from '../assets/contract';
import { handoffAt, startSpeedAt, startTimeAt, type GaitLoop } from '../assets/startClip';
import { GAME } from '../config/game';
import { IDLE_VARIATIONS } from '../config/idle';
import { physicsOf } from '../config/physics';
import { createRng } from '../sim/rng';
import type { Unit } from '../sim/Unit';
import { opposite, teamDir } from '../sim/types';
import type { World } from '../sim/World';
import { lowestPoint } from './grounding';
import { pathCenterZ, pathSlope, terrainHeight } from './terrain';
import { IdleScheduler } from './IdleScheduler';
import { ModelAnimator } from './ModelAnimator';
import { excludeFromAO } from './post';

const LUNGE_TIME = 0.32;
const barBg = new MeshBasicMaterial({ color: 0x000000, depthTest: false, transparent: true, opacity: 0.6, fog: false });
/** Health bar fill: red for every unit, readable on grass, dirt and rock. */
const BAR_RED = 0xef5350;
const barFg = new MeshBasicMaterial({ color: BAR_RED, depthTest: false, toneMapped: false, fog: false }); // UI colour: same shade everywhere (no tone mapping, no distance fog)
/** The hovered unit's bar is drawn a little larger. */
const HOVER_BAR_SCALE = 1.2;
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

/** Bounds of the stride-matching playback factor (a unit just starting off or stopping). */
export const GAIT_SPEED = { min: 0.35, max: 1.5 };

/**
 * Loop clip and playback factor for a live unit. Moving units play their sim gait: `run` over
 * distance and `walk` on short approaches when the model has both clips (a model without `run`
 * has one locomotion loop, `walk`, for both gaits). The factor is ground speed over the speed the
 * clip was authored for (`authored`, from the asset manifest; default: a run at the unit type's
 * speed, a walk at its walking-gait speed), so the feet keep pace with the ground.
 */
export function gaitLoop(
  unit: Unit,
  hasRun: boolean,
  authored: Partial<Record<GaitLoop, number>> = {},
  groundSpeed = unit.vel,
): { clip: 'idle' | GaitLoop; speed: number } {
  if (!unit.moving) return { clip: 'idle', speed: 1 };
  const walking = hasRun && unit.gait === 'walk';
  const clip = hasRun && !walking ? 'run' : 'walk';
  const ref = authored[clip] ?? (walking ? (physicsOf(unit.def.id).walk?.speed ?? unit.def.speed) : unit.def.speed);
  return { clip, speed: Math.min(GAIT_SPEED.max, Math.max(GAIT_SPEED.min, groundSpeed / ref)) };
}

/**
 * Ground speed of a unit drawn on the winding footpath: the lane speed times the path's length
 * per lane metre (a bend is longer than the straight lane it follows).
 */
export function pathSpeed(laneSpeed: number, x: number): number {
  const s = pathSlope(x);
  return laneSpeed * Math.sqrt(1 + s * s);
}

/**
 * The start clip hands over to its loop early if the unit moves faster than this many times the
 * clip's own speed (it would have to be fast-forwarded), e.g. when the gait turns into a run.
 */
export const START_MAX_RATE = 2.5;

export interface UnitViewOptions {
  variants?: ReadonlyMap<ClipName, readonly AnimationClip[]>;
  /**
   * Seconds into the attack clip where the blow lands; the swing is started this long before
   * the sim applies the damage, so the hit and the strike frame coincide.
   */
  strike?: number;
  /** Strike time of the `melee` clip (hand-to-hand blow of a ranged unit); with it, melee plays `melee`. */
  meleeStrike?: number;
  /** Called when a strike-synced swing starts (swing whoosh). */
  onSwing?: (unit: Unit) => void;
  /** Authored gait speeds and the prepared `start` clip (AssetLibrary.locomotionFor). */
  locomotion?: Locomotion;
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
  /** Which routine the last swing belonged to; a switch (sling -> fists) re-arms the swing. */
  private swingMode: 'melee' | 'ranged' = 'ranged';
  /** Current heading (model yaw) and where to look while fighting (null: face the way it walks). */
  private yaw = 0;
  private target: { x: number; z: number } | null = null;
  /** Present only for models that ship contract clips. */
  readonly animator: ModelAnimator | null;
  /** When this unit plays its idle variation (null: its type has none). */
  private idleVariation: IdleScheduler | null = null;
  /** Setting off: metres moved since the start clip began (null: not starting). */
  private startDist: number | null = null;
  private lastX = 0;
  /** Under the pointer (GameRenderer): its health bar shows, in red. */
  private hovered = false;
  /** Model extents at rest (local): the box the pointer can hover. */
  private readonly body: Box3;

  constructor(
    readonly poolKey: string,
    private readonly model: Object3D,
    clips: ReadonlyMap<ClipName, AnimationClip>,
    private readonly opts: UnitViewOptions = {},
  ) {
    this.animator = clips.size > 0 ? new ModelAnimator(model, clips, opts.variants) : null;
    model.updateMatrixWorld(true);
    this.body = new Box3().setFromObject(model);
    this.reach = Math.max(0, this.body.max.x);
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
    this.swingMode = 'ranged';
    this.hovered = false;
    this.target = null;
    this.startDist = null;
    this.lastX = unit.x;
    const iv = IDLE_VARIATIONS[unit.def.id];
    this.idleVariation = iv && this.animator?.has(iv.clip) ? new IdleScheduler(iv, createRng(unit.id * 7919 + 3)) : null;
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

  /**
   * The sim struck (`mode` of the blow). Strike-synced swings are already playing by now (started
   * early, see syncSwing), so this only starts the blow's clip when it is not playing yet (models
   * without strike timing); it must never cut a running swing short, e.g. the Slingshot Man's
   * punch with his sling shot.
   */
  triggerAttack(mode: 'melee' | 'ranged' = 'ranged'): void {
    if (!this.animator) {
      this.lunge = LUNGE_TIME;
      return;
    }
    const clip = mode === 'melee' && this.usesFists() ? 'melee' : 'attack';
    if (this.animator.playing !== clip) this.animator.playOnce(clip);
  }

  /** A ranged unit fighting hand to hand with its own `melee` clip (Slingshot Man's fists). */
  private usesFists(): boolean {
    return !!this.unit.def.ranged && this.opts.meleeStrike !== undefined && !!this.animator?.has('melee');
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
      else {
        this.playGait(this.animator);
        this.playIdleVariation(this.animator, dt);
      }
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

    const frac = Math.min(1, Math.max(0, u.health / u.maxHealth)); // (also when health exceeds max)
    // Shown when damaged, and always for the unit under the pointer (drawn a little larger).
    this.bar.visible = this.hovered || frac < 1;
    this.bar.scale.setScalar(this.hovered ? HOVER_BAR_SCALE : 1);
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
    const melee = u.meleeTimer !== null;
    // A ranged unit fighting hand to hand throws its own blow (`melee` clip), if the model has one.
    const fists = melee && this.usesFists();
    const strike = fists ? this.opts.meleeStrike : this.opts.strike;
    const clip = fists ? 'melee' : 'attack';
    const timer = melee ? u.meleeTimer : u.def.ranged ? u.rangedTimer : null;
    const mode = melee ? 'melee' : 'ranged';
    if (mode !== this.swingMode) {
      this.swingMode = mode;
      this.swingArmed = true; // a new routine: its first blow gets its own swing
    }
    if (strike === undefined || !this.animator || u.state === 'dead' || timer === null) {
      this.swingArmed = true;
      return;
    }
    const lead = strike / this.swingRate;
    if (timer > lead + 1e-6) {
      this.swingArmed = true;
    } else if (this.swingArmed) {
      this.swingArmed = false;
      if (this.animator.playOnce(clip) && melee) this.opts.onSwing?.(u);
    }
  }

  /**
   * Locomotion: idle, run or walk from the sim (gaitLoop). Setting off from a standstill into a
   * walk plays the model's `start` clip (Start Walking), its time driven by the distance the unit
   * has actually moved so planted feet stay put, then hands over to the walk (or run) loop at the
   * phase whose leg pose matches, with the same foot forward.
   */
  private playGait(animator: ModelAnimator): void {
    const u = this.unit;
    // Distance and speed along the drawn path, which is what the feet have to cover.
    const x = this.root.position.x;
    const moved = pathSpeed(Math.abs(u.x - this.lastX), x);
    this.lastX = u.x;
    const loco = this.opts.locomotion ?? {};
    const want = gaitLoop(u, animator.has('run'), loco.gaitSpeed, pathSpeed(u.vel, x));
    const start = loco.start;
    if (start && want.clip === 'walk' && this.startDist === null && (animator.loop === 'idle' || animator.loop === null)) {
      this.startDist = 0;
      animator.playLoop('start', 0);
    }
    if (this.startDist !== null) {
      if (!start || want.clip === 'idle' || animator.loop !== 'start') {
        this.startDist = null; // stopped, or a one-shot took over
      } else {
        this.startDist += moved;
        const t = startTimeAt(start, this.startDist);
        const outrun = t > 0.2 && pathSpeed(u.vel, x) > START_MAX_RATE * Math.max(0.05, startSpeedAt(start, t));
        if (t < start.exit && want.clip === 'walk' && !outrun) {
          animator.scrub(t);
          return;
        }
        this.startDist = null;
        animator.playLoop(want.clip, handoffAt(start, want.clip, t)?.phase);
      }
    }
    animator.playLoop(want.clip);
    animator.setLoopSpeed(want.speed);
  }

  /**
   * The occasional idle variation (config/idle.ts): only while the unit stands idle out of combat
   * with nothing else playing; stopped (blended out) as soon as that no longer holds. Moving,
   * attacking and dying also take over by themselves (ModelAnimator priorities).
   */
  private playIdleVariation(animator: ModelAnimator, dt: number): void {
    const iv = this.idleVariation;
    if (!iv) return;
    const u = this.unit;
    const calm = u.state === 'waiting' && !u.moving;
    const clip = iv.cfg.clip;
    if (animator.playing === clip) {
      if (!calm) animator.cancel(clip);
      iv.update(dt, false);
    } else if (iv.update(dt, calm && animator.playing === 'idle')) {
      animator.playOnce(clip);
    }
  }

  /** Pointer over this unit or not (GameRenderer picks it each frame). */
  setHovered(on: boolean): void {
    this.hovered = on;
  }

  /** What its health bar shows now (for tests and debugging). */
  get barState(): { visible: boolean; red: boolean; frac: number } {
    return { visible: this.bar.visible, red: (this.fill.material as MeshBasicMaterial).color.getHex() === BAR_RED, frac: this.fill.scale.x / BAR_W };
  }

  get id(): number {
    return this.unit.id;
  }

  /** World box the pointer can hover (model bounds, at least shoulder-wide); null once dead. */
  hoverBox(out: Box3): Box3 | null {
    if (!this.unit || this.unit.state === 'dead' || !this.root.visible) return null;
    const p = this.root.position;
    const half = Math.max(0.35, Math.abs(this.body.min.x), Math.abs(this.body.max.x), Math.abs(this.body.min.z), Math.abs(this.body.max.z));
    out.min.set(p.x - half, p.y, p.z - half);
    out.max.set(p.x + half, p.y + Math.max(1, this.body.max.y), p.z + half);
    return out;
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

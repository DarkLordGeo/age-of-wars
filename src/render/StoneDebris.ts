import { Color, InstancedMesh, Matrix4, MeshStandardMaterial, Quaternion, Vector3, type Material, type Scene } from 'three';
import { STONE_DEBRIS } from '../config/debris';
import type { ProjectileDef } from '../config/schema';
import type { SimEvent } from '../sim/types';
import { rockGeometry, STONE_VARIANTS, stoneLook, stoneRadius, stoneRotation, type StoneLook } from './stoneShapes';
import { pathCenterZ } from './terrain';

/** Ground height (m) at world (x, z). */
export type GroundFn = (x: number, z: number) => number;

/** One landed (or landing) stone: a small rigid sphere in world space. */
export interface Stone {
  /** Landing order: the oldest goes first when the cap is reached. */
  seq: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** Angular velocity (rad/s). */
  wx: number;
  wy: number;
  wz: number;
  radius: number;
  invMass: number;
  color: number;
  rot: Quaternion;
  /** Mesh variant and per-axis proportions (stoneShapes.ts). */
  variant: number;
  scale: Vector3;
  /** At rest: skipped by the integrator, a fixed obstacle for the others until something wakes it. */
  asleep: boolean;
  /** Touching the ground or another stone during the last sub-step. */
  supported: boolean;
  /** Position at the start of the sub-step (to measure how far it really moved). */
  px: number;
  py: number;
  pz: number;
  sleepTimer: number;
  /** Seconds since it came down. */
  age: number;
  /** Seconds left of its fade-out (null: not fading). */
  fading: number | null;
}

type Config = typeof STONE_DEBRIS;
type Impact = Extract<SimEvent, { type: 'projectileImpact' }>;

/**
 * Drop a persisting projectile's stone into `debris` from its impact event, continuing it in
 * world space with the shape and tumble it flew with: a miss keeps its momentum (it is coming
 * down onto the ground), a hit glances off the target and drops at its feet. Returns the stone,
 * or null when the projectile does not leave debris.
 */
export function landStone(debris: StoneDebris, e: Impact, def: ProjectileDef | undefined, ground: GroundFn, cfg: Config = STONE_DEBRIS): Stone | null {
  if (!def?.persists || (e.hit && !cfg.dropOnHit)) return null;
  const z = e.z + pathCenterZ(e.x);
  const r = cfg.hitRebound;
  const v = e.hit ? [-r * e.vx, Math.min(0, e.vy) * 0.3, -r * e.vz] : [e.vx, e.vy, e.vz];
  const look = stoneLook(e.projectileId);
  const spin = e.hit ? 0.4 : 1;
  return debris.drop(e.x, e.y + ground(e.x, z), z, v[0]!, v[1]!, v[2]!, stoneRadius(look, def.size), def.color, e.projectileId, {
    look,
    rot: stoneRotation(look, e.age),
    w: look.spinAxis.clone().multiplyScalar(look.spinRate * spin),
  });
}

const N = new Vector3();
const T = new Vector3();
const RA = new Vector3();
const RB = new Vector3();
const VA = new Vector3();
const VB = new Vector3();
const W = new Vector3();
const J = new Vector3();
const DQ = new Quaternion();

/** World velocity of the surface point at arm `r` of a stone (v + w x r). */
function pointVel(s: Stone, r: Vector3, out: Vector3): Vector3 {
  return out.set(s.wx, s.wy, s.wz).cross(r).add(W.set(s.vx, s.vy, s.vz));
}

function applyImpulse(s: Stone, r: Vector3, j: Vector3, invMass: number): void {
  if (invMass === 0) return;
  s.vx += j.x * invMass;
  s.vy += j.y * invMass;
  s.vz += j.z * invMass;
  const invI = invMass / (0.4 * s.radius * s.radius); // solid sphere
  W.copy(r).cross(j).multiplyScalar(invI);
  s.wx += W.x;
  s.wy += W.y;
  s.wz += W.z;
}

/**
 * Stones left on the battlefield: small rigid spheres (collision proxies for the irregular rock
 * meshes) without a physics engine. Each sub-step integrates gravity, position and spin, then
 * resolves stone-on-stone contacts (impulses from mass and relative velocity, restitution,
 * Coulomb friction that also spins the stones, overlap pushed apart by inverse mass) found through
 * a spatial hash, then the terrain contact (same impulses against the ground normal, plus rolling
 * resistance). A stone is held on or above the ground every step, sub-steps shrink when stones
 * move fast, and resting stones sleep: they stop being integrated and act as fixed obstacles
 * until a hard enough hit wakes them, so piles do not jitter.
 */
export class StoneDebris {
  readonly stones: Stone[] = [];
  private seq = 0;
  private readonly grid = new Map<number, Stone[]>();
  private cell = 0.3;

  constructor(
    private readonly ground: GroundFn,
    private readonly cfg: Config = STONE_DEBRIS,
  ) {}

  /** A stone comes down at world (x, y, z) with velocity v; `seed` varies its look when none is given. */
  drop(
    x: number, y: number, z: number, vx: number, vy: number, vz: number, radius: number, color: number, seed: number,
    opts: { look?: StoneLook; rot?: Quaternion; w?: Vector3 } = {},
  ): Stone {
    const look = opts.look ?? stoneLook(seed);
    const floor = this.ground(x, z) + radius * (1 - this.cfg.embed);
    const w = opts.w ?? look.spinAxis.clone().multiplyScalar(look.spinRate);
    const s: Stone = {
      seq: this.seq++, x, y: Math.max(y, floor), z, vx, vy, vz, wx: w.x, wy: w.y, wz: w.z,
      radius, invMass: 1 / (radius * radius * radius), color,
      rot: (opts.rot ?? look.rot).clone(), variant: look.variant, scale: look.scale.clone(),
      asleep: false, supported: false, px: x, py: y, pz: z, sleepTimer: 0, age: 0, fading: null,
    };
    this.stones.push(s);
    this.cell = Math.max(this.cell, 2.2 * radius);
    this.enforceCap();
    return s;
  }

  /** Remove every stone (new match). */
  clear(): void {
    this.stones.length = 0;
  }

  /** Stones currently lying around, including those fading out. */
  get count(): number {
    return this.stones.length;
  }

  /** Stones currently simulated (not asleep). */
  get awake(): number {
    let n = 0;
    for (const s of this.stones) if (!s.asleep) n++;
    return n;
  }

  step(dt: number): void {
    if (dt <= 0) return;
    const c = this.cfg;
    this.age(dt);
    let maxSpeed = 0;
    let minR = Infinity;
    for (const s of this.stones) {
      minR = Math.min(minR, s.radius);
      if (!s.asleep) maxSpeed = Math.max(maxSpeed, Math.hypot(s.vx, s.vy, s.vz));
    }
    if (maxSpeed === 0 && this.awake === 0) return;
    // Enough sub-steps that no stone moves more than half the smallest radius per sub-step.
    const n = Math.min(c.maxSubsteps, Math.max(Math.ceil(dt / c.substep), Math.ceil((maxSpeed * dt) / (0.5 * minR))));
    const h = dt / n;
    for (let i = 0; i < n; i++) this.substep(h);
    this.limitAwake();
  }

  /** Visual scale of a stone (1, shrinking to 0 while it fades out). */
  scaleOf(s: Stone): number {
    return s.fading === null ? 1 : Math.max(0, s.fading / this.cfg.fade);
  }

  private age(dt: number): void {
    const c = this.cfg;
    for (let i = this.stones.length - 1; i >= 0; i--) {
      const s = this.stones[i]!;
      s.age += dt;
      if (s.fading === null && c.maxAge > 0 && s.age > c.maxAge) s.fading = c.fade;
      if (s.fading !== null) {
        s.fading -= dt;
        if (s.fading <= 0) {
          this.stones.splice(i, 1);
          this.wakeAround(s);
        }
      }
    }
  }

  private substep(h: number): void {
    const c = this.cfg;
    for (const s of this.stones) {
      if (s.asleep) continue;
      s.supported = false;
      s.px = s.x;
      s.py = s.y;
      s.pz = s.z;
      s.vy -= c.gravity * h;
      s.x += s.vx * h;
      s.y += s.vy * h;
      s.z += s.vz * h;
      // q += 0.5 * (0, w) * q * h
      DQ.set(s.wx, s.wy, s.wz, 0).multiply(s.rot);
      s.rot.set(s.rot.x + 0.5 * h * DQ.x, s.rot.y + 0.5 * h * DQ.y, s.rot.z + 0.5 * h * DQ.z, s.rot.w + 0.5 * h * DQ.w).normalize();
    }
    this.buildGrid();
    for (const a of this.stones) {
      if (a.asleep) continue;
      const cx = Math.floor(a.x / this.cell);
      const cz = Math.floor(a.z / this.cell);
      for (let i = -1; i <= 1; i++) {
        for (let k = -1; k <= 1; k++) {
          const bucket = this.grid.get(key(cx + i, cz + k));
          if (!bucket) continue;
          for (const b of bucket) if (b !== a && (b.asleep || a.seq < b.seq)) this.collide(a, b, h);
        }
      }
    }
    for (const s of this.stones) if (!s.asleep) this.groundContact(s, h);
    for (const s of this.stones) {
      if (s.asleep) continue;
      // How far it really moved this sub-step (contacts can cancel a velocity that never reaches 0).
      const moved = Math.hypot(s.x - s.px, s.y - s.py, s.z - s.pz) / h;
      const slow = Math.min(moved, Math.hypot(s.vx, s.vy, s.vz)) < c.sleepSpeed && Math.hypot(s.wx, s.wy, s.wz) * s.radius < c.sleepSpeed;
      s.sleepTimer = s.supported && slow ? s.sleepTimer + h : 0;
      if (s.sleepTimer >= c.sleepTime) this.sleep(s);
    }
  }

  private buildGrid(): void {
    this.grid.clear();
    for (const s of this.stones) {
      const k = key(Math.floor(s.x / this.cell), Math.floor(s.z / this.cell));
      const bucket = this.grid.get(k);
      if (bucket) bucket.push(s);
      else this.grid.set(k, [s]);
    }
  }

  private collide(a: Stone, b: Stone, h: number): void {
    const c = this.cfg;
    N.set(b.x - a.x, b.y - a.y, b.z - a.z);
    const dist = N.length();
    const overlap = a.radius + b.radius - dist;
    if (overlap <= 0) return;
    if (dist > 1e-9) N.divideScalar(dist);
    else N.set(0, 1, 0);
    RA.copy(N).multiplyScalar(a.radius);
    RB.copy(N).multiplyScalar(-b.radius);
    let invB = b.asleep ? 0 : b.invMass;
    const invA = a.invMass;
    const vn = pointVel(b, RB, VB).sub(pointVel(a, RA, VA)).dot(N);
    if (vn < 0) {
      const e = -vn > c.bounceMin ? c.stoneRestitution : 0;
      // Would this hit move the resting stone noticeably? Then it takes part (and wakes).
      if (b.asleep && ((-(1 + e) * vn) / (invA + b.invMass)) * b.invMass > c.wakeSpeed) {
        this.wake(b);
        invB = b.invMass;
      }
      const jn = (-(1 + e) * vn) / (invA + invB);
      applyImpulse(a, RA, J.copy(N).multiplyScalar(-jn), invA);
      applyImpulse(b, RB, J.copy(N).multiplyScalar(jn), invB);
      // Friction on the tangential slip at the contact (spins both stones).
      const rel = pointVel(b, RB, VB).sub(pointVel(a, RA, VA));
      T.copy(rel).addScaledVector(N, -rel.dot(N));
      const slip = T.length();
      if (slip > 1e-9) {
        T.divideScalar(slip);
        const jt = Math.min(slip / (3.5 * (invA + invB)), c.stoneFriction * jn);
        applyImpulse(a, RA, J.copy(T).multiplyScalar(jt), invA);
        applyImpulse(b, RB, J.copy(T).multiplyScalar(-jt), invB);
      }
    } else {
      // Resting on (or carrying) another stone: friction still acts on any slip or spin, bounded
      // by the weight the contact carries this sub-step, and rough rock damps rolling in place.
      const rel = pointVel(b, RB, VB).sub(pointVel(a, RA, VA));
      T.copy(rel).addScaledVector(N, -rel.dot(N));
      const slip = T.length();
      if (slip > 1e-9) {
        T.divideScalar(slip);
        const top = N.y < 0 ? a : b;
        const jt = Math.min(slip / (3.5 * (invA + invB)), (c.stoneFriction * c.gravity * h * Math.abs(N.y)) / top.invMass);
        applyImpulse(a, RA, J.copy(T).multiplyScalar(jt), invA);
        applyImpulse(b, RB, J.copy(T).multiplyScalar(-jt), invB);
      }
      const damp = Math.max(0, 1 - c.rolling * c.gravity * h / Math.max(a.radius, 1e-3));
      for (const s of invB > 0 ? [a, b] : [a]) {
        s.wx *= damp;
        s.wy *= damp;
        s.wz *= damp;
      }
    }
    // Push apart (no overlap left behind, no velocity added).
    const corr = Math.max(0, overlap - 0.001) / (invA + invB);
    a.x -= N.x * corr * invA;
    a.y -= N.y * corr * invA;
    a.z -= N.z * corr * invA;
    b.x += N.x * corr * invB;
    b.y += N.y * corr * invB;
    b.z += N.z * corr * invB;
    a.supported = true; // held by b (from below or wedged at the side)
    if (invB > 0) b.supported = true;
  }

  private groundContact(s: Stone, h: number): void {
    const c = this.cfg;
    const floor = this.ground(s.x, s.z) + s.radius * (1 - c.embed);
    if (s.y > floor) return;
    s.y = floor; // never under the surface
    s.supported = true;
    // Terrain normal from the height field.
    const e = 0.05;
    N.set(this.ground(s.x - e, s.z) - this.ground(s.x + e, s.z), 2 * e, this.ground(s.x, s.z - e) - this.ground(s.x, s.z + e)).normalize();
    RA.copy(N).multiplyScalar(-s.radius);
    const vn = pointVel(s, RA, VA).dot(N);
    if (vn < 0) {
      const hard = -vn > c.bounceMin;
      const rest = hard ? c.restitution : 0;
      if (hard) {
        // Digging into the turf: sideways speed and spin are lost (no velocity is ever added).
        const vnn = s.vx * N.x + s.vy * N.y + s.vz * N.z;
        const keep = 1 - c.turfDrag;
        s.vx = N.x * vnn + (s.vx - N.x * vnn) * keep;
        s.vy = N.y * vnn + (s.vy - N.y * vnn) * keep;
        s.vz = N.z * vnn + (s.vz - N.z * vnn) * keep;
        s.wx *= keep;
        s.wy *= keep;
        s.wz *= keep;
      }
      const jn = (-(1 + rest) * vn) / s.invMass;
      applyImpulse(s, RA, J.copy(N).multiplyScalar(jn), s.invMass);
      const rel = pointVel(s, RA, VA);
      T.copy(rel).addScaledVector(N, -rel.dot(N));
      const slip = T.length();
      if (slip > 1e-9) {
        T.divideScalar(slip);
        const jt = Math.min(slip / (3.5 * s.invMass), c.friction * jn);
        applyImpulse(s, RA, J.copy(T).multiplyScalar(-jt), s.invMass);
      }
    } else {
      // Resting contact: friction still bites on any slip (gravity's share along the normal).
      const rel = pointVel(s, RA, VA);
      T.copy(rel).addScaledVector(N, -rel.dot(N));
      const slip = T.length();
      if (slip > 1e-9) {
        T.divideScalar(slip);
        const jt = Math.min(slip / (3.5 * s.invMass), (c.friction * c.gravity * h * N.y) / s.invMass);
        applyImpulse(s, RA, J.copy(T).multiplyScalar(-jt), s.invMass);
      }
    }
    // Rolling resistance: uneven turf eats the roll.
    const v = Math.hypot(s.vx, s.vz);
    if (v > 1e-9) {
      const k = Math.max(0, v - c.rolling * c.gravity * h) / v;
      s.vx *= k;
      s.vz *= k;
      s.wx *= k;
      s.wy *= k;
      s.wz *= k;
    } else {
      s.wx *= 0.9;
      s.wy *= 0.9;
      s.wz *= 0.9;
    }
  }

  private sleep(s: Stone): void {
    s.asleep = true;
    s.vx = s.vy = s.vz = 0;
    s.wx = s.wy = s.wz = 0;
    s.sleepTimer = 0;
  }

  private wake(s: Stone): void {
    s.asleep = false;
    s.sleepTimer = 0;
  }

  /** A stone went away: whatever rested on or against it must settle again. */
  private wakeAround(gone: Stone): void {
    for (const s of this.stones) {
      if (s.asleep && Math.hypot(s.x - gone.x, s.y - gone.y, s.z - gone.z) < s.radius + gone.radius + 0.02) this.wake(s);
    }
  }

  /** Too many moving at once: the oldest that are already supported and slow come to rest first. */
  private limitAwake(): void {
    let awake = this.awake;
    if (awake <= this.cfg.maxAwake) return;
    for (const s of this.stones) {
      if (awake <= this.cfg.maxAwake) break;
      if (!s.asleep && s.supported && Math.hypot(s.vx, s.vy, s.vz) < 1) {
        this.sleep(s);
        awake--;
      }
    }
  }

  private enforceCap(): void {
    const c = this.cfg;
    let alive = 0;
    for (const s of this.stones) if (s.fading === null) alive++;
    // Fade the oldest out until `max` remain; if fading ones would still overflow the buffer
    // (max + a slack for fade-outs), drop the oldest at once.
    for (const s of this.stones) {
      if (alive <= c.max) break;
      if (s.fading === null) {
        s.fading = c.fade;
        alive--;
      }
    }
    const hard = c.max + Math.max(8, Math.ceil(c.max * 0.1));
    if (this.stones.length > hard) for (const s of this.stones.splice(0, this.stones.length - hard)) this.wakeAround(s);
  }
}

function key(i: number, k: number): number {
  return (i + 32768) * 65536 + (k + 32768);
}

const COLOR = new Color();

/** Draws the debris with one instanced mesh per rock variant. */
export class StoneDebrisMesh {
  readonly meshes: InstancedMesh[] = [];
  private readonly m = new Matrix4();
  private readonly p = new Vector3();
  private readonly sc = new Vector3();

  constructor(scene: Scene, capacity: number, material: Material = new MeshStandardMaterial({ roughness: 0.92, flatShading: true })) {
    for (let v = 0; v < STONE_VARIANTS; v++) {
      const mesh = new InstancedMesh(rockGeometry(v), material, capacity);
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.name = `StoneDebris${v}`;
      mesh.setColorAt(0, COLOR.set(0xffffff));
      scene.add(mesh);
      this.meshes.push(mesh);
    }
  }

  sync(debris: StoneDebris): void {
    const counts = new Array<number>(this.meshes.length).fill(0);
    for (const s of debris.stones) {
      const mesh = this.meshes[s.variant % this.meshes.length]!;
      const n = counts[s.variant % this.meshes.length]!;
      if (n >= mesh.instanceMatrix.count) continue;
      // The mesh is unit diameter; the collision sphere is the mean of the scaled half-extents.
      const d = (2 * s.radius * debris.scaleOf(s)) / ((s.scale.x + s.scale.y + s.scale.z) / 3);
      this.m.compose(this.p.set(s.x, s.y, s.z), s.rot, this.sc.copy(s.scale).multiplyScalar(d));
      mesh.setMatrixAt(n, this.m);
      mesh.setColorAt(n, COLOR.setHex(s.color));
      counts[s.variant % this.meshes.length] = n + 1;
    }
    this.meshes.forEach((mesh, i) => {
      mesh.count = counts[i]!;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    });
  }
}

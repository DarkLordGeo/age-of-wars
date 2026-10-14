import { Color, IcosahedronGeometry, InstancedMesh, Matrix4, MeshStandardMaterial, Quaternion, Vector3, type Material, type Scene } from 'three';
import { STONE_DEBRIS } from '../config/debris';
import type { ProjectileDef } from '../config/schema';
import type { SimEvent } from '../sim/types';
import { pathCenterZ } from './terrain';

/** Ground height (m) at world (x, z). */
export type GroundFn = (x: number, z: number) => number;

/** One landed (or landing) stone, in world space. */
export interface Stone {
  /** Landing order: the oldest goes first when the cap is reached. */
  seq: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  radius: number;
  color: number;
  rot: Quaternion;
  /** At rest: no more updates until it is removed. */
  asleep: boolean;
  /** Seconds since it came down. */
  age: number;
  /** Seconds left of its fade-out (null: not fading). */
  fading: number | null;
}

type Config = typeof STONE_DEBRIS;

/**
 * Drop a persisting projectile's stone into `debris` from its impact event, continuing it in
 * world space: a miss keeps its momentum (it is coming down onto the ground), a hit glances off
 * the target and drops at its feet. Returns the stone, or null when the projectile does not leave
 * debris.
 */
export function landStone(debris: StoneDebris, e: Extract<SimEvent, { type: 'projectileImpact' }>, def: ProjectileDef | undefined, ground: GroundFn, cfg: Config = STONE_DEBRIS): Stone | null {
  if (!def?.persists || (e.hit && !cfg.dropOnHit)) return null;
  const z = e.z + pathCenterZ(e.x);
  const r = cfg.hitRebound;
  const v = e.hit ? [-r * e.vx, Math.min(0, e.vy) * 0.3, -r * e.vz] : [e.vx, e.vy, e.vz];
  return debris.drop(e.x, e.y + ground(e.x, z), z, v[0]!, v[1]!, v[2]!, def.size / 2, def.color, e.projectileId);
}

const AXIS = new Vector3();
const TURN = new Quaternion();

/**
 * Stones left on the battlefield: lightweight point physics against the terrain (no physics
 * engine). Gravity until contact; a contact faster than `bounceMin` bounces with `restitution`
 * and loses `impactFriction` of its horizontal speed; slower contacts slide with Coulomb friction
 * while the stone tumbles as if rolling; under `sleepSpeed` it rests and is skipped. A stone is
 * never below the ground surface (it is held at the surface every step, so it cannot tunnel).
 */
export class StoneDebris {
  readonly stones: Stone[] = [];
  private seq = 0;

  constructor(
    private readonly ground: GroundFn,
    private readonly cfg: Config = STONE_DEBRIS,
  ) {}

  /** A stone comes down at world (x, y, z) with velocity v; `seed` varies its resting pose. */
  drop(x: number, y: number, z: number, vx: number, vy: number, vz: number, radius: number, color: number, seed: number): Stone {
    const rot = new Quaternion().setFromAxisAngle(AXIS.set(Math.sin(seed * 12.9898), Math.cos(seed * 78.233), Math.sin(seed * 3.7)).normalize(), seed * 2.39996);
    const floor = this.ground(x, z) + radius * (1 - this.cfg.embed);
    const s: Stone = { seq: this.seq++, x, y: Math.max(y, floor), z, vx, vy, vz, radius, color, rot, asleep: false, age: 0, fading: null };
    this.stones.push(s);
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

  step(dt: number): void {
    if (dt <= 0) return;
    const c = this.cfg;
    for (let i = this.stones.length - 1; i >= 0; i--) {
      const s = this.stones[i]!;
      s.age += dt;
      if (s.fading === null && c.maxAge > 0 && s.age > c.maxAge) s.fading = c.fade;
      if (s.fading !== null) {
        s.fading -= dt;
        if (s.fading <= 0) {
          this.stones.splice(i, 1);
          continue;
        }
      }
      if (!s.asleep) this.move(s, dt);
    }
  }

  /** Visual scale of a stone (1, shrinking to 0 while it fades out). */
  scaleOf(s: Stone): number {
    return s.fading === null ? 1 : Math.max(0, s.fading / this.cfg.fade);
  }

  private move(s: Stone, dt: number): void {
    const c = this.cfg;
    const floor = (x: number, z: number) => this.ground(x, z) + s.radius * (1 - c.embed);
    const before = floor(s.x, s.z);
    const airborne = s.y > before + 1e-4 || s.vy > 0;
    if (airborne) s.vy -= c.gravity * dt;
    s.x += s.vx * dt;
    s.z += s.vz * dt;
    s.y += s.vy * dt;
    const h = Math.hypot(s.vx, s.vz);
    const g = floor(s.x, s.z);
    if (s.y <= g) {
      s.y = g; // on (never under) the surface
      if (s.vy < -c.bounceMin) {
        s.vy = -s.vy * c.restitution;
        const keep = 1 - c.impactFriction;
        s.vx *= keep;
        s.vz *= keep;
      } else {
        s.vy = 0;
        // Sliding friction on the ground.
        const nh = Math.max(0, h - c.friction * c.gravity * dt);
        const k = h > 1e-9 ? nh / h : 0;
        s.vx *= k;
        s.vz *= k;
        if (nh < c.sleepSpeed) {
          s.vx = s.vz = 0;
          s.asleep = true;
        }
      }
    }
    // Tumble about the horizontal axis across the motion, as if rolling.
    if (h > 1e-6) {
      AXIS.set(-s.vz / h, 0, s.vx / h);
      s.rot.premultiply(TURN.setFromAxisAngle(AXIS, -(h * dt) / s.radius));
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
    if (this.stones.length > hard) this.stones.splice(0, this.stones.length - hard);
  }
}

/** Draws the debris with one instanced mesh (reusing the projectile stone look). */
export class StoneDebrisMesh {
  readonly mesh: InstancedMesh;
  private readonly m = new Matrix4();
  private readonly p = new Vector3();
  private readonly sc = new Vector3();

  constructor(scene: Scene, capacity: number, material: Material = new MeshStandardMaterial({ roughness: 0.9, flatShading: true })) {
    this.mesh = new InstancedMesh(new IcosahedronGeometry(0.5, 0), material, capacity);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.name = 'StoneDebris';
    scene.add(this.mesh);
  }

  sync(debris: StoneDebris): void {
    let n = 0;
    const cap = this.mesh.instanceMatrix.count;
    for (const s of debris.stones) {
      if (n >= cap) break;
      const d = 2 * s.radius * debris.scaleOf(s);
      this.m.compose(this.p.set(s.x, s.y, s.z), s.rot, this.sc.set(d, d * 0.8, d));
      this.mesh.setMatrixAt(n, this.m);
      this.mesh.setColorAt(n, COLOR.setHex(s.color));
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

const COLOR = new Color();

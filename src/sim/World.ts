import { CONTENT } from '../config/content';
import { physicsOf, type Gait } from '../config/physics';
import { GAME } from '../config/game';
import { NEXT_AGE_XP } from '../config/ages';
import { lookup, type Content, type UnitDef, type UpgradeDef } from '../config/schema';
import { Base, Turret } from './Base';
import { OriginalAi } from './OriginalAi';
import { Projectile } from './Projectile';
import { TeamState } from './TeamState';
import { Unit } from './Unit';
import { createRng } from './rng';
import { availableUpgrades, canAdvanceAge, currentAge, isTurretAvailable, isUnitUnlocked, xpToEvolve } from './progression';
import {
  opposite,
  teamDir,
  TEAMS,
  type EnqueueResult,
  type GameStatus,
  type SimEvent,
  type SlotResult,
  type Team,
  type TurretResult,
} from './types';

export interface WorldOptions {
  content?: Content;
  /** Key into content.ai: the enemy's difficulty. */
  difficulty?: string;
  /** Set false to run without the enemy AI (tests, scripted scenarios). */
  ai?: boolean;
  /** AI profile key to also auto-play the player team (the main menu's background battle). */
  autoPlayer?: string;
  seed?: number;
}

/**
 * Pure game simulation following the original Age of War rules (docs/AGE1_SPEC.md).
 * No Three.js, no DOM, no wall-clock: advance it with step(dt). Presentation layers read the
 * public state and consume events via drainEvents().
 *
 * Lane model: x is each unit's front. A team's units walk in single file (no passing): a unit
 * stops when the gap to the body of the ally ahead is at most GAME.minUnitGap; the leading unit
 * stops that far from the enemy's front unit, or at the enemy base edge. Every unit attacks only
 * the enemy team's FRONT unit (or the base when none is left).
 */
/** Height (m) a unit's ranged shot leaves from (the slingshot's release point). */
const SHOT_RELEASE_HEIGHT = 1.45;
/** Slack (m) around a unit's body when testing projectile hits. */
const HIT_MARGIN = 0.15;
/** Height (m) of a base's hitbox for unit shots. */
const BASE_HIT_HEIGHT = 2 * GAME.baseAimHeight;

/**
 * First parameter t in [0, 1] at which the segment (x0, y0)->(x1, y1) is inside the box
 * [bx0, bx1] x [by0, by1] (slab test), or null. A segment starting inside returns 0.
 */
export function segmentBox(x0: number, y0: number, x1: number, y1: number, bx0: number, bx1: number, by0: number, by1: number): number | null {
  let t0 = 0;
  let t1 = 1;
  for (const [a, d, lo, hi] of [[x0, x1 - x0, bx0, bx1], [y0, y1 - y0, by0, by1]] as const) {
    if (Math.abs(d) < 1e-12) {
      if (a < lo || a > hi) return null;
      continue;
    }
    let ta = (lo - a) / d;
    let tb = (hi - a) / d;
    if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta);
    t1 = Math.min(t1, tb);
    if (t0 > t1) return null;
  }
  return t0;
}

/**
 * Gait decision with hysteresis: a runner walks once `room` < enter (unless the ally ahead is
 * running), a walker runs again once `room` > exit or the ally ahead runs; no switch before
 * `hold` seconds in the current gait.
 */
export function nextGait(gait: 'run' | 'walk', gaitFor: number, room: number, leaderRuns: boolean, g: Gait): 'run' | 'walk' {
  if (gaitFor < g.hold) return gait;
  if (gait === 'run') return room < g.enter && !leaderRuns ? 'walk' : 'run';
  return room > g.exit || leaderRuns ? 'run' : 'walk';
}

export class World {
  readonly content: Content;
  /** Every unit including corpses still lingering for death animations. */
  readonly units: Unit[] = [];
  /** Living units per team, kept sorted by ascending X. */
  readonly alive: Record<Team, Unit[]> = { player: [], enemy: [] };
  readonly projectiles: Projectile[] = [];
  readonly bases: Record<Team, Base>;
  readonly teams: Record<Team, TeamState>;
  readonly ai: OriginalAi | null;
  /** Present only when the player team is AI-driven (attract mode). */
  readonly playerAi: OriginalAi | null;
  /** Unit HP/damage multiplier per team (difficulty applies to the AI side). */
  readonly statMultiplier: Record<Team, number> = { player: 1, enemy: 1 };

  time = 0;
  status: GameStatus = 'playing';
  /** X coordinate of the active battle (contact point, or the leading unit if no contact). */
  frontlineX = 0;

  private readonly events: SimEvent[] = [];
  private readonly rng: () => number;
  /** Shot variation (arc, aim point within the target): its own stream, so other randomness is unchanged. */
  private readonly shotRng: () => number;
  private readonly projectilePool: Projectile[] = [];
  private nextId = 1;
  private nextProjectileId = 1;

  constructor(opts: WorldOptions = {}) {
    this.content = opts.content ?? CONTENT;
    this.rng = createRng(opts.seed ?? GAME.seed);
    this.shotRng = createRng(((opts.seed ?? GAME.seed) ^ 0x5eed5) >>> 0);
    const profile = this.content.ai[opts.difficulty ?? GAME.defaultDifficulty];
    const hp = this.content.ages[0]!.baseHealth;

    this.bases = {
      player: new Base('player', -GAME.baseOffset, GAME.baseRadius, hp),
      enemy: new Base('enemy', GAME.baseOffset, GAME.baseRadius, hp),
    };
    this.teams = {
      player: new TeamState('player', GAME.economy.startGold),
      enemy: new TeamState('enemy', GAME.economy.startGold),
    };
    this.ai = opts.ai !== false && profile ? new OriginalAi(this, profile, 'enemy') : null;
    if (this.ai) this.statMultiplier.enemy = profile!.statMultiplier;
    const auto = opts.autoPlayer ? this.content.ai[opts.autoPlayer] : undefined;
    this.playerAi = auto ? new OriginalAi(this, { ...auto, seed: auto.seed + 101 }, 'player') : null;
    if (this.playerAi) this.statMultiplier.player = auto!.statMultiplier;
  }

  // ---------------------------------------------------------------- commands

  /** Pay for a unit and add it to the team's production queue (`free`: the AI, which has no economy). */
  enqueueUnit(team: Team, unitId: string, opts: { free?: boolean } = {}): EnqueueResult {
    if (this.status !== 'playing') return 'game-over';
    const def = this.content.units[unitId];
    if (!def) return 'unknown-unit';
    const ts = this.teams[team];
    if (!isUnitUnlocked(this.content, ts, unitId)) return 'locked';
    if (ts.queue.length >= GAME.economy.queueSize) return 'queue-full';
    if (!opts.free) {
      if (ts.gold < def.cost) return 'unaffordable';
      ts.gold -= def.cost;
    }
    ts.queue.push({ defId: unitId, remaining: def.spawnTime, total: def.spawnTime, paid: opts.free ? 0 : def.cost });
    return 'ok';
  }

  /** Remove a queued unit and refund what was paid for it. */
  cancelQueued(team: Team, index: number): boolean {
    const ts = this.teams[team];
    const item = ts.queue[index];
    if (!item || this.status !== 'playing') return false;
    ts.queue.splice(index, 1);
    ts.gold += item.paid;
    return true;
  }

  /**
   * Build a turret on a bought, empty slot (default: the lowest free one). `free`: AI scripts.
   */
  buildTurret(team: Team, turretId: string, slot?: number, opts: { free?: boolean } = {}): TurretResult {
    if (this.status !== 'playing') return 'game-over';
    const def = this.content.turrets[turretId];
    if (!def) return 'unknown-turret';
    const ts = this.teams[team];
    if (!isTurretAvailable(this.content, ts, turretId)) return 'locked';
    const base = this.bases[team];
    const s = slot ?? base.turrets.findIndex((t, i) => i < base.slots && t === null);
    if (s < 0 || s >= base.slots) return 'no-free-slot';
    if (base.turrets[s]) return 'slot-taken';
    if (!opts.free) {
      if (ts.gold < def.cost) return 'unaffordable';
      ts.gold -= def.cost;
    }
    const mount = this.slotPosition(team, s);
    base.turrets[s] = new Turret(s, def, mount.x, GAME.slotHeights[s]!, mount.z);
    this.events.push({ type: 'turretBuilt', team, slot: s, turretId });
    return 'ok';
  }

  /** Sell the turret on `slot` for GAME.turretSellRefund of its price. */
  sellTurret(team: Team, slot: number, opts: { refund?: boolean } = {}): TurretResult {
    if (this.status !== 'playing') return 'game-over';
    const base = this.bases[team];
    const t = base.turrets[slot];
    if (!t) return 'empty-slot';
    base.turrets[slot] = null;
    const refund = opts.refund === false ? 0 : Math.floor(t.def.cost * GAME.turretSellRefund);
    this.teams[team].gold += refund;
    this.events.push({ type: 'turretSold', team, slot, turretId: t.def.id, refund });
    return 'ok';
  }

  /** Price of the next turret slot, or null when all four are bought. */
  nextSlotCost(team: Team): number | null {
    return GAME.slotCosts[this.bases[team].slots - 1] ?? null;
  }

  buySlot(team: Team): SlotResult {
    if (this.status !== 'playing') return 'game-over';
    const cost = this.nextSlotCost(team);
    if (cost === null) return 'max-slots';
    const ts = this.teams[team];
    if (ts.gold < cost) return 'unaffordable';
    ts.gold -= cost;
    this.bases[team].slots++;
    this.events.push({ type: 'slotBought', team, slots: this.bases[team].slots });
    return 'ok';
  }

  /** XP needed to evolve from the current age (shown in the HUD even before age 2 exists). */
  xpToEvolve(team: Team): number | null {
    return xpToEvolve(this.content, this.teams[team], NEXT_AGE_XP);
  }

  canAdvanceAge(team: Team): boolean {
    return this.status === 'playing' && canAdvanceAge(this.content, this.teams[team]);
  }

  advanceAge(team: Team): boolean {
    if (!this.canAdvanceAge(team)) return false;
    const ts = this.teams[team];
    const prevHp = currentAge(this.content, ts).baseHealth;
    ts.ageIndex++;
    const age = currentAge(this.content, ts);
    const base = this.bases[team];
    base.maxHealth = age.baseHealth;
    base.health += age.baseHealth - prevHp;
    this.events.push({ type: 'ageAdvanced', team, ageId: age.id });
    return true;
  }

  unitUnlocked(team: Team, unitId: string): boolean {
    return isUnitUnlocked(this.content, this.teams[team], unitId);
  }

  availableUpgrades(team: Team): UpgradeDef[] {
    return availableUpgrades(this.content, this.teams[team]);
  }

  purchaseUpgrade(team: Team, upgradeId: string): 'ok' | 'game-over' | 'unavailable' | 'unaffordable' {
    if (this.status !== 'playing') return 'game-over';
    const ts = this.teams[team];
    const up = this.availableUpgrades(team).find((u) => u.id === upgradeId);
    if (!up) return 'unavailable';
    if (ts.gold < up.cost) return 'unaffordable';
    ts.gold -= up.cost;
    ts.upgrades.add(upgradeId);
    ts.rebuildModifiers(this.content);
    this.events.push({ type: 'upgradePurchased', team, upgradeId });
    return 'ok';
  }

  /** Spawn a unit immediately at the team's base, ignoring cost and queue (tests, scenarios). */
  spawnUnit(team: Team, unitId: string, x?: number): Unit {
    const def = lookup(this.content.units, unitId, 'unit');
    const ts = this.teams[team];
    const mult = this.statMultiplier[team];
    const z = (this.rng() * 2 - 1) * GAME.laneHalfWidth;
    const maxHealth = Math.floor(ts.stat('units', 'maxHealth', def.maxHealth) * mult);
    const unit = new Unit(this.nextId++, def, team, x ?? this.spawnX(team, def), z, maxHealth, mult);
    this.units.push(unit);
    this.alive[team].push(unit);
    this.sortLane(team);
    this.events.push({ type: 'spawn', unitId: unit.id, team });
    return unit;
  }

  /** Ground position of turret slot `slot` on the team's base (see GAME.slotMounts). */
  slotPosition(team: Team, slot: number): { x: number; z: number } {
    const m = GAME.slotMounts[slot]!;
    return { x: this.bases[team].x + teamDir(team) * m.forward, z: m.side };
  }

  // -------------------------------------------------------------- simulation

  step(dt: number): void {
    if (this.status !== 'playing') {
      this.tickCorpses(dt);
      this.updateProjectiles(dt);
      return;
    }
    this.time += dt;

    if (GAME.economy.baseIncomePerSec > 0) {
      for (const team of TEAMS) {
        const ts = this.teams[team];
        ts.gold += ts.stat('base', 'income', GAME.economy.baseIncomePerSec) * dt;
      }
    }
    this.ai?.update(dt);
    this.playerAi?.update(dt);

    this.updateProduction(dt);
    for (const team of TEAMS) this.sortLane(team);
    this.updateUnits(dt);
    for (const team of TEAMS) this.sortLane(team);
    this.updateTurrets(dt);
    this.updateProjectiles(dt);
    this.resolveDeaths();
    this.tickCorpses(dt);
    this.updateFrontline();
    this.checkEnd();
  }

  /** Hand every queued event to `sink` and clear the queue. */
  drainEvents(sink: (ev: SimEvent) => void): void {
    for (let i = 0; i < this.events.length; i++) sink(this.events[i]!);
    this.events.length = 0;
  }

  // -------------------------------------------------------------- production

  private spawnX(team: Team, def: UnitDef): number {
    return this.bases[team].x + teamDir(team) * def.length;
  }

  private updateProduction(dt: number): void {
    for (const team of TEAMS) {
      const q = this.teams[team].queue;
      const head = q[0];
      if (!head) continue;
      head.remaining = Math.max(0, head.remaining - dt);
      if (head.remaining > 0) continue;
      const def = lookup(this.content.units, head.defId, 'unit');
      if (!this.spawnPointClear(team, def)) continue; // the last unit out hasn't cleared the door yet
      q.shift();
      this.spawnUnit(team, def.id);
    }
  }

  private spawnPointClear(team: Team, def: UnitDef): boolean {
    const list = this.alive[team];
    // The rearmost ally (closest to our base) is first (player) or last (enemy) in the sorted lane.
    const rear = team === 'player' ? list[0] : list[list.length - 1];
    if (!rear) return true;
    const gap = (rear.x - this.spawnX(team, def)) * teamDir(team) - rear.def.length;
    return gap >= GAME.minUnitGap - 1e-6;
  }

  // ------------------------------------------------------------------- units

  /** Enemy front unit as seen from `team` (the hostile unit nearest to team's base side). */
  private enemyFront(team: Team): Unit | undefined {
    const foes = this.alive[opposite(team)];
    return team === 'player' ? foes[0] : foes[foes.length - 1];
  }

  /** Where a team's units stop at the enemy base (its edge) and from which they attack it. */
  private baseStop(team: Team): number {
    const b = this.bases[opposite(team)];
    return b.x - teamDir(team) * b.radius;
  }

  private updateUnits(dt: number): void {
    // Front units first so the ones behind see this tick's positions.
    const p = this.alive.player;
    for (let i = p.length - 1; i >= 0; i--) this.updateUnit(p[i]!, dt);
    const e = this.alive.enemy;
    for (let i = 0; i < e.length; i++) this.updateUnit(e[i]!, dt);
  }

  private updateUnit(unit: Unit, dt: number): void {
    const def = unit.def;
    const dir = teamDir(unit.team);
    const list = this.alive[unit.team];
    const ahead = list[unit.laneIndex + dir];
    const front = this.enemyFront(unit.team);

    // --- movement: single file, no passing
    let room: number;
    if (ahead) {
      room = (ahead.x - unit.x) * dir - ahead.def.length - GAME.minUnitGap;
    } else if (front) {
      room = (front.x - unit.x) * dir - GAME.minUnitGap;
    } else {
      room = (this.baseStop(unit.team) - unit.x) * dir;
    }
    const top = this.teams[unit.team].stat('units', 'speed', def.speed);
    const phys = physicsOf(def.id);
    if (phys.holdAtRange && def.ranged) {
      // Walk up to the firing position and hold there (same reach rule as the ranged check below).
      const reach = front ? (front.x - unit.x) * dir - GAME.minUnitGap : (this.baseStop(unit.team) - unit.x) * dir;
      room = Math.min(room, reach - def.ranged.range);
    }
    const free = Math.max(0, room);
    // Gait: run over distance, walk the last few metres to the enemy, the base or a halted queue.
    // The ally ahead is updated first, so its gait this tick is known; following a running ally
    // keeps the column running instead of walk/run cycling behind it.
    const gait = phys.walk;
    if (gait) {
      unit.gaitFor += dt;
      const want = nextGait(unit.gait, unit.gaitFor, room, !!ahead && ahead.moving && ahead.gait === 'run', gait);
      if (want !== unit.gait) {
        unit.gait = want;
        unit.gaitFor = 0;
      }
    }
    const cap = gait && unit.gait === 'walk' ? Math.min(top, gait.speed) : top;
    // Accelerate toward the gait's speed (or slow down to it), and brake early enough to stop
    // exactly at the gap (v <= sqrt(2 * decel * room)): heavy units start and stop gradually.
    const accel = gait && unit.gait === 'walk' ? Math.min(phys.accel, gait.accel) : phys.accel;
    let v = unit.vel <= cap ? Math.min(cap, unit.vel + accel * dt) : Math.max(cap, unit.vel - phys.decel * dt);
    if (Number.isFinite(phys.decel)) v = Math.min(v, Math.sqrt(2 * phys.decel * free));
    const step = Math.min(v * dt, free);
    unit.vel = dt > 0 ? step / dt : 0;
    unit.moving = step > 1e-6;
    unit.x += dir * step;

    // --- attack flags against the enemy front unit, or the base when none is left
    const dist = front ? (front.x - unit.x) * dir : (this.baseStop(unit.team) - unit.x) * dir;
    const melee = dist <= def.melee.range + 1e-6;
    const rangedReach = front ? dist - GAME.minUnitGap : dist;
    const ranged = !!def.ranged && rangedReach <= def.ranged.range + 1e-6;

    // --- timers (each routine starts when its flag first holds, like the original coroutines)
    if (melee && unit.meleeTimer === null) unit.meleeTimer = def.melee.firstHit;
    else if (!melee && ranged && unit.rangedTimer === null) unit.rangedTimer = 0;

    if (unit.meleeTimer !== null) {
      unit.meleeTimer -= dt;
      if (unit.meleeTimer <= 0) {
        if (melee || ranged) this.unitStrike(unit, 'melee', def.melee.damage);
        unit.meleeTimer = melee ? unit.meleeTimer + def.melee.interval : null;
      }
    }
    if (unit.rangedTimer !== null && def.ranged) {
      unit.rangedTimer -= dt;
      if (unit.rangedTimer <= 0) {
        if (!melee && ranged) this.unitStrike(unit, 'ranged', def.ranged.damage);
        unit.rangedTimer = ranged ? unit.rangedTimer + (unit.moving ? def.ranged.intervalWalking : def.ranged.intervalStanding) : null;
      }
    }

    unit.state = melee || ranged ? 'attacking' : unit.moving ? 'advancing' : 'waiting';
  }

  /** A unit's hit lands on the enemy front unit, or the enemy base when none is left. */
  private unitStrike(unit: Unit, mode: 'melee' | 'ranged', baseDamage: number): void {
    const ts = this.teams[unit.team];
    const damage = Math.floor(ts.stat('units', 'damage', baseDamage) * unit.damageMultiplier);
    this.events.push({ type: 'attack', team: unit.team, sourceKind: 'unit', sourceId: unit.id, mode });
    const front = this.enemyFront(unit.team);
    if (mode === 'ranged' && unit.def.ranged) {
      // A real stone from the release point; damage only if it hits (updateProjectiles).
      this.launchShot(unit, unit.def.ranged.projectileId, damage, front);
      return;
    }
    if (front) this.damageUnit(front, damage);
    else this.damageBase(this.bases[opposite(unit.team)], damage);
  }

  // ----------------------------------------------------------------- turrets

  private updateTurrets(dt: number): void {
    for (const team of TEAMS) {
      const base = this.bases[team];
      const ts = this.teams[team];
      const target = this.enemyFront(team);
      const tdir = teamDir(opposite(team));
      for (const t of base.turrets) {
        if (!t) continue;
        const range = ts.stat('turrets', 'range', t.def.range);
        let inRange = false;
        if (target) {
          const dx = target.centerX(tdir) - t.x;
          const dy = target.def.height * 0.5 - t.y;
          inRange = Math.hypot(dx, dy) <= range;
        }
        if (inRange && t.timer === null) t.timer = t.def.firstShot;
        if (t.timer === null) continue;
        t.timer -= dt;
        if (t.timer > 0) continue;
        if (inRange && target) {
          this.fireTurret(team, t, target);
          t.timer += ts.stat('turrets', 'cooldown', t.def.interval);
        } else {
          t.timer = null;
        }
      }
    }
  }

  private fireTurret(team: Team, t: Turret, target: Unit): void {
    const ts = this.teams[team];
    const dir = teamDir(team);
    let dx = target.centerX(teamDir(target.team)) - t.x;
    const dy = target.def.height * 0.5 - t.y;
    // Catapult quirk: from the lowest slot it can't aim closer than minAimDistanceSlot0.
    if (t.def.minAimDistanceSlot0 && t.slot === 0 && dx * dir < t.def.minAimDistanceSlot0) dx = dir * t.def.minAimDistanceSlot0;
    const len = Math.hypot(dx, dy) || 1;
    const def = lookup(this.content.projectiles, t.def.projectileId, 'projectile');
    const p = this.allocProjectile(team, def.id);
    p.damage = Math.floor(ts.stat('turrets', 'damage', t.def.damage));
    p.x = t.x;
    p.y = t.y;
    p.z = t.z;
    p.vx = (dx / len) * def.speed;
    p.vy = (dy / len) * def.speed;
    // Lateral drift so the shot meets the target's (cosmetic) z when it reaches it.
    const time = Math.abs(dx) / Math.max(1e-3, Math.abs(p.vx));
    p.vz = (target.z - t.z) / Math.max(0.05, time);
    this.events.push({ type: 'attack', team, sourceKind: 'turret', sourceId: t.slot, mode: 'ranged' });
    this.events.push({ type: 'projectileFired', projectileId: p.id, defId: def.id, team, x: p.x, y: p.y, z: p.z });
  }

  // ------------------------------------------------------------- projectiles

  private allocProjectile(team: Team, defId: string): Projectile {
    const p = this.projectilePool.pop() ?? new Projectile();
    p.id = this.nextProjectileId++;
    p.def = lookup(this.content.projectiles, defId, 'projectile');
    p.team = team;
    p.age = 0;
    p.damage = 0;
    p.hitsBase = false;
    p.vx = p.vy = p.vz = 0;
    this.projectiles.push(p);
    return p;
  }

  /**
   * A unit's ranged shot: from its release point (its front, at hand height) on a ballistic arc
   * aimed at the enemy front unit's body (led by its walking speed) or the enemy base.
   */
  private launchShot(unit: Unit, defId: string, damage: number, front: Unit | undefined): void {
    const p = this.allocProjectile(unit.team, defId);
    const g = p.def.gravity;
    p.damage = damage;
    p.hitsBase = true;
    p.x = unit.x;
    p.y = SHOT_RELEASE_HEIGHT;
    p.z = unit.z;
    // Natural variation (seeded, so replays match): a somewhat flatter or higher arc, and an aim
    // point anywhere on the target's body rather than its exact centre. The point stays inside
    // the hitbox, so a shot that would hit still hits.
    const r = this.shotRng;
    const speed = p.def.speed * (0.88 + 0.24 * r());
    let tx: number, ty: number, tz: number;
    if (front) {
      const fdir = teamDir(front.team);
      const aimX = front.centerX(fdir) + (r() - 0.5) * 0.5 * front.def.length;
      ty = front.def.height * (0.35 + 0.35 * r());
      tz = front.z + (r() - 0.5) * 0.3;
      // Lead a walking target by its actual speed (units accelerate and brake): where it will be
      // after the flight, the flight time itself depending on that point (a few fixed-point steps
      // converge, the target being much slower than the stone).
      const lead = front.moving ? fdir * front.vel : 0;
      tx = aimX;
      for (let k = 0; k < 3; k++) tx = aimX + lead * (Math.hypot(tx - p.x, tz - p.z) / speed);
    } else {
      tx = this.baseStop(unit.team) + teamDir(unit.team) * (0.3 + 0.5 * r());
      ty = GAME.baseAimHeight * (0.7 + 0.6 * r());
      tz = (r() - 0.5) * 1.5;
    }
    const t = Math.max(0.12, Math.hypot(tx - p.x, tz - p.z) / speed);
    p.vx = (tx - p.x) / t;
    p.vz = (tz - p.z) / t;
    p.vy = (ty - p.y + 0.5 * g * t * t) / t;
    this.events.push({ type: 'projectileFired', projectileId: p.id, defId, team: unit.team, x: p.x, y: p.y, z: p.z });
  }

  private updateProjectiles(dt: number): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i]!;
      p.age += dt;
      const ox = p.x;
      const oy = p.y;
      p.vy -= p.def.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      let done = false;
      // Swept test along this step's path: the first enemy hitbox it crosses takes the damage.
      const hit = this.status === 'playing' ? this.sweep(p, ox, oy) : null;
      const oz = p.z - p.vz * dt;
      if (hit) {
        p.x = ox + (p.x - ox) * hit.t;
        p.y = oy + (p.y - oy) * hit.t;
        p.z = oz + (p.z - oz) * hit.t;
        if (hit.unit) this.damageUnit(hit.unit, p.damage);
        else this.damageBase(this.bases[opposite(p.team)], p.damage);
        this.impact(p, true);
        done = true;
      } else if (p.y <= 0) {
        // Down on the ground: stop exactly where the path crosses it (y = 0).
        const t = oy > 0 ? oy / (oy - p.y) : 0;
        p.x = ox + (p.x - ox) * t;
        p.z = oz + (p.z - oz) * t;
        p.y = 0;
        this.impact(p, false);
        done = true;
      } else if (p.age >= GAME.projectileLifetime || Math.abs(p.x) > GAME.baseOffset + 20) {
        this.impact(p, false);
        done = true;
      }
      if (done) {
        this.projectiles[i] = this.projectiles[this.projectiles.length - 1]!;
        this.projectiles.pop();
        this.projectilePool.push(p);
      }
    }
  }

  private impact(p: Projectile, hit: boolean): void {
    this.events.push({ type: 'projectileImpact', projectileId: p.id, defId: p.def.id, hit, x: p.x, y: p.y, z: p.z, vx: p.vx, vy: p.vy, vz: p.vz, age: p.age });
  }

  /**
   * Earliest crossing (t in [0, 1] along the segment from (ox, oy) to the projectile's position)
   * of an enemy unit's body box (lane x interval x [0, height]) or, for unit shots, the enemy
   * base box. Null on a miss.
   */
  private sweep(p: Projectile, ox: number, oy: number): { t: number; unit: Unit | null } | null {
    let best: { t: number; unit: Unit | null } | null = null;
    const enemy = opposite(p.team);
    const dir = teamDir(enemy);
    for (const u of this.alive[enemy]) {
      const back = u.x - dir * u.def.length;
      const t = segmentBox(ox, oy, p.x, p.y, Math.min(u.x, back) - HIT_MARGIN, Math.max(u.x, back) + HIT_MARGIN, 0, u.def.height);
      if (t !== null && (!best || t < best.t)) best = { t, unit: u };
    }
    if (p.hitsBase) {
      const b = this.bases[enemy];
      const t = segmentBox(ox, oy, p.x, p.y, b.x - b.radius, b.x + b.radius, 0, BASE_HIT_HEIGHT);
      if (t !== null && (!best || t < best.t)) best = { t, unit: null };
    }
    return best;
  }

  // ------------------------------------------------------------------ damage

  private damageUnit(unit: Unit, amount: number): void {
    if (!unit.alive || unit.health <= 0) return; // already dying this tick
    unit.health -= amount;
    this.events.push({
      type: 'hit', targetKind: 'unit', targetId: unit.id, team: unit.team,
      damage: amount, x: unit.centerX(teamDir(unit.team)), y: unit.def.height * 0.6, z: unit.z,
    });
  }

  private damageBase(base: Base, amount: number): void {
    if (base.destroyed) return;
    base.health = Math.max(0, base.health - amount);
    this.events.push({
      type: 'hit', targetKind: 'base', targetId: -1, team: base.team,
      damage: amount, x: base.x, y: GAME.baseAimHeight, z: 0,
    });
    this.events.push({ type: 'baseDamage', team: base.team, damage: amount, health: base.health });
  }

  // ----------------------------------------------------------------- upkeep

  /** Gold the opposing team receives when a unit of this type dies. */
  killReward(def: UnitDef): number {
    return Math.round(GAME.economy.killRewardMultiplier * def.cost);
  }

  /**
   * Resolve deaths after all attacks this tick so trades are symmetric. Like the original, the
   * opposing team is paid for every death (whoever dealt the blow) and the owner gets a little XP.
   */
  private resolveDeaths(): void {
    for (const team of TEAMS) {
      const list = this.alive[team];
      let w = 0;
      let removed = false;
      for (let r = 0; r < list.length; r++) {
        const u = list[r]!;
        if (u.health > 0) {
          list[w++] = u;
          continue;
        }
        removed = true;
        u.health = 0;
        u.state = 'dead';
        const reward = this.killReward(u.def);
        const killer = this.teams[opposite(team)];
        killer.gold += reward;
        killer.xp += reward * GAME.economy.killXpMultiplier;
        this.teams[team].xp += Math.floor(reward * GAME.economy.ownLossXpMultiplier);
        this.events.push({ type: 'death', unitId: u.id, team: u.team, killerTeam: opposite(team) });
      }
      list.length = w;
      if (removed) this.sortLane(team);
    }
  }

  private tickCorpses(dt: number): void {
    for (let i = this.units.length - 1; i >= 0; i--) {
      const unit = this.units[i]!;
      if (unit.alive) continue;
      unit.deadFor += dt;
      if (unit.deadFor >= GAME.corpseLinger) {
        this.units[i] = this.units[this.units.length - 1]!;
        this.units.pop();
      }
    }
  }

  /** Insertion sort (lanes are nearly sorted every tick) + index refresh. */
  private sortLane(team: Team): void {
    const a = this.alive[team];
    for (let i = 1; i < a.length; i++) {
      const u = a[i]!;
      let j = i - 1;
      while (j >= 0 && a[j]!.x > u.x) {
        a[j + 1] = a[j]!;
        j--;
      }
      a[j + 1] = u;
    }
    for (let i = 0; i < a.length; i++) a[i]!.laneIndex = i;
  }

  private updateFrontline(): void {
    const p = this.alive.player;
    const e = this.alive.enemy;
    const pf = p[p.length - 1];
    const ef = e[0];
    if (pf && ef) this.frontlineX = (pf.x + ef.x) / 2;
    else if (pf) this.frontlineX = pf.x;
    else if (ef) this.frontlineX = ef.x;
    else this.frontlineX = 0;
  }

  private checkEnd(): void {
    // A simultaneous fall counts as a win for the player.
    if (this.bases.enemy.destroyed) {
      this.status = 'victory';
      this.events.push({ type: 'victory' });
    } else if (this.bases.player.destroyed) {
      this.status = 'defeat';
      this.events.push({ type: 'defeat' });
    }
  }
}

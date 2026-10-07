import { CONTENT } from '../config/content';
import { GAME } from '../config/game';
import { lookup, type AttackDef, type Content, type UnitDef, type UpgradeDef } from '../config/schema';
import { Base, Turret } from './Base';
import { EnemyAi } from './EnemyAi';
import { Projectile } from './Projectile';
import { TeamState } from './TeamState';
import { Unit } from './Unit';
import { createRng } from './rng';
import {
  availableUpgrades,
  canAdvanceAge,
  currentAge,
  isUnitUnlocked,
} from './progression';
import {
  opposite,
  teamDir,
  TEAMS,
  type EnqueueResult,
  type GameStatus,
  type SimEvent,
  type Team,
} from './types';

export interface WorldOptions {
  content?: Content;
  /** Key into content.ai. */
  difficulty?: string;
  /** Set false to run without the enemy AI (tests, scripted scenarios). */
  ai?: boolean;
  seed?: number;
}

/** Reusable result slot for target queries (avoids per-tick allocation). */
interface TargetSlot {
  unit: Unit | null;
  base: Base | null;
  /** Edge-to-edge distance along the lane. */
  distance: number;
}

/**
 * Pure game simulation. No Three.js, no DOM, no wall-clock: advance it with step(dt).
 * Presentation layers read the public state and consume events via drainEvents().
 */
export class World {
  readonly content: Content;
  /** Every unit including corpses still lingering for death animations. */
  readonly units: Unit[] = [];
  /** Living units per team, kept sorted by ascending X. */
  readonly alive: Record<Team, Unit[]> = { player: [], enemy: [] };
  readonly projectiles: Projectile[] = [];
  readonly bases: Record<Team, Base>;
  readonly teams: Record<Team, TeamState>;
  readonly ai: EnemyAi | null;

  time = 0;
  status: GameStatus = 'playing';
  /** X coordinate of the active battle (contact point, or the leading unit if no contact). */
  frontlineX = 0;

  private readonly events: SimEvent[] = [];
  private readonly rng: () => number;
  private readonly projectilePool: Projectile[] = [];
  private readonly scratch: TargetSlot = { unit: null, base: null, distance: Infinity };
  private nextId = 1;
  private nextProjectileId = 1;

  constructor(opts: WorldOptions = {}) {
    this.content = opts.content ?? CONTENT;
    this.rng = createRng(opts.seed ?? GAME.seed);
    const profile = this.content.ai[opts.difficulty ?? GAME.defaultDifficulty];

    this.bases = {
      player: new Base('player', -GAME.baseOffset, GAME.baseRadius, GAME.baseMaxHealth),
      enemy: new Base('enemy', GAME.baseOffset, GAME.baseRadius, GAME.baseMaxHealth),
    };
    this.teams = {
      player: new TeamState('player', GAME.economy.startGold, 1),
      enemy: new TeamState('enemy', profile?.startGold ?? GAME.economy.startGold, profile?.incomeMultiplier ?? 1),
    };
    for (const team of TEAMS) this.equipTurrets(team);
    this.ai = opts.ai !== false && profile ? new EnemyAi(this, profile) : null;
  }

  // ---------------------------------------------------------------- commands

  /** Pay for a unit and add it to the team's production queue. */
  enqueueUnit(team: Team, unitId: string): EnqueueResult {
    if (this.status !== 'playing') return 'game-over';
    const def = this.content.units[unitId];
    if (!def) return 'unknown-unit';
    const ts = this.teams[team];
    if (!isUnitUnlocked(this.content, ts, unitId)) return 'locked';
    if (ts.queue.length >= GAME.economy.queueSize) return 'queue-full';
    if (ts.gold < def.cost) return 'unaffordable';
    ts.gold -= def.cost;
    ts.queue.push({ defId: unitId, remaining: def.spawnTime, total: def.spawnTime });
    return 'ok';
  }

  /** Remove a queued unit and refund its full cost. */
  cancelQueued(team: Team, index: number): boolean {
    const ts = this.teams[team];
    const item = ts.queue[index];
    if (!item || this.status !== 'playing') return false;
    ts.queue.splice(index, 1);
    ts.gold += lookup(this.content.units, item.defId, 'unit').cost;
    return true;
  }

  canAdvanceAge(team: Team): boolean {
    return this.status === 'playing' && canAdvanceAge(this.content, this.teams[team]);
  }

  advanceAge(team: Team): boolean {
    if (!this.canAdvanceAge(team)) return false;
    const ts = this.teams[team];
    ts.ageIndex++;
    this.equipTurrets(team);
    this.events.push({ type: 'ageAdvanced', team, ageId: currentAge(this.content, ts).id });
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

    const base = this.bases[team];
    const newMax = ts.stat('base', 'maxHealth', GAME.baseMaxHealth);
    base.health += Math.max(0, newMax - base.maxHealth);
    base.maxHealth = newMax;

    this.events.push({ type: 'upgradePurchased', team, upgradeId });
    return 'ok';
  }

  /** Spawn a unit immediately at the team's base, ignoring cost and queue (tests, scenarios). */
  spawnUnit(team: Team, unitId: string): Unit {
    const def = lookup(this.content.units, unitId, 'unit');
    const base = this.bases[team];
    const x = base.x + teamDir(team) * (base.radius + def.radius + 0.5);
    const z = (this.rng() * 2 - 1) * GAME.laneHalfWidth;
    const maxHealth = this.teams[team].stat('units', 'maxHealth', def.maxHealth);
    const unit = new Unit(this.nextId++, def, team, x, z, maxHealth);
    this.units.push(unit);
    this.alive[team].push(unit);
    this.sortLane(team);
    this.events.push({ type: 'spawn', unitId: unit.id, team });
    return unit;
  }

  // -------------------------------------------------------------- simulation

  step(dt: number): void {
    if (this.status !== 'playing') {
      this.tickCorpses(dt);
      return;
    }
    this.time += dt;

    for (const team of TEAMS) {
      const ts = this.teams[team];
      ts.gold += ts.stat('base', 'income', GAME.economy.baseIncomePerSec * ts.incomeMultiplier) * dt;
    }
    this.ai?.update(dt);

    for (const team of TEAMS) this.sortLane(team);
    this.updateProduction(dt);
    this.updateUnits(dt);
    for (const team of TEAMS) this.sortLane(team); // passing ranged allies can reorder the lane
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

  private updateProduction(dt: number): void {
    for (const team of TEAMS) {
      const q = this.teams[team].queue;
      const head = q[0];
      if (!head) continue;
      head.remaining = Math.max(0, head.remaining - dt);
      if (head.remaining > 0) continue;
      const def = lookup(this.content.units, head.defId, 'unit');
      if (!this.spawnPointClear(team, def)) continue; // wait for the exit to clear
      q.shift();
      this.spawnUnit(team, def.id);
    }
  }

  private spawnPointClear(team: Team, def: UnitDef): boolean {
    const list = this.alive[team];
    // Closest ally to our own base is first (player) or last (enemy) in the sorted lane.
    const nearest = team === 'player' ? list[0] : list[list.length - 1];
    if (!nearest) return true;
    const base = this.bases[team];
    const x = base.x + teamDir(team) * (base.radius + def.radius + 0.5);
    return Math.abs(nearest.x - x) >= nearest.def.radius + def.radius + GAME.allySpacing;
  }

  // ------------------------------------------------------------------- units

  private updateUnits(dt: number): void {
    const p = this.alive.player;
    for (let i = p.length - 1; i >= 0; i--) this.updateUnit(p[i]!, dt);
    const e = this.alive.enemy;
    for (let i = 0; i < e.length; i++) this.updateUnit(e[i]!, dt);
  }

  private updateUnit(unit: Unit, dt: number): void {
    const ts = this.teams[unit.team];
    const atk = unit.def.attack;
    unit.cooldown = Math.max(0, unit.cooldown - dt);

    const range = ts.stat('units', 'range', atk.range);
    const detect = unit.def.detectionRange + (range - atk.range);
    const found = this.findTarget(unit, detect);
    const slot = this.scratch;

    if (found && slot.distance <= range) {
      unit.state = 'attacking';
      if (unit.cooldown === 0) {
        unit.cooldown = ts.stat('units', 'cooldown', atk.cooldown);
        const dir = teamDir(unit.team);
        this.launchAttack(
          unit.team, 'unit', unit.id, atk, ts.stat('units', 'damage', atk.damage),
          unit.x + dir * unit.def.radius, unit.def.muzzleHeight, unit.z, slot.unit, slot.base?.team ?? null,
        );
      }
      return;
    }

    // Detected but out of range: close the gap. Otherwise march toward the enemy base.
    let step = ts.stat('units', 'speed', unit.def.speed) * dt;
    if (found) {
      unit.state = 'engaging';
      step = Math.min(step, slot.distance - range + 1e-4);
    } else {
      unit.state = 'advancing';
    }

    const room = this.roomAhead(unit);
    if (room < step) {
      step = Math.max(0, room);
      if (step === 0) unit.state = 'waiting';
    }
    unit.x += teamDir(unit.team) * step;
  }

  /** Fills `this.scratch` with the nearest hostile ahead within `detect`. */
  private findTarget(unit: Unit, detect: number): boolean {
    const s = this.scratch;
    s.unit = null;
    s.base = null;
    s.distance = Infinity;

    const enemies = this.alive[opposite(unit.team)];
    if (enemies.length > 0) {
      const dir = teamDir(unit.team);
      const cand =
        dir === 1
          ? enemies[firstIndexAtLeast(enemies, unit.x - unit.def.radius)]
          : enemies[firstIndexAtLeast(enemies, unit.x + unit.def.radius + 1e-9) - 1];
      if (cand) {
        const d = Math.max(0, Math.abs(cand.x - unit.x) - unit.def.radius - cand.def.radius);
        if (d <= detect) {
          s.unit = cand;
          s.distance = d;
        }
      }
    }

    const base = this.bases[opposite(unit.team)];
    if (!base.destroyed) {
      const d = Math.max(0, Math.abs(base.x - unit.x) - base.radius - unit.def.radius);
      if (d <= detect && d < s.distance) {
        s.unit = null;
        s.base = base;
        s.distance = d;
      }
    }
    return s.unit !== null || s.base !== null;
  }

  /** Free walking distance before bumping into the living ally directly ahead. */
  private roomAhead(unit: Unit): number {
    const list = this.alive[unit.team];
    const stride = unit.team === 'player' ? 1 : -1;
    let i = unit.laneIndex + stride;
    let ally = list[i];
    // Ranged allies stop to shoot; non-ranged units walk past them (lanes have lateral
    // spread) so a firing line can never wall off the army behind it.
    if (unit.def.role !== 'ranged') {
      while (ally && ally.def.role === 'ranged') ally = list[(i += stride)];
    }
    if (!ally) return Infinity;
    const ahead = (ally.x - unit.x) * teamDir(unit.team);
    return ahead - unit.def.radius - ally.def.radius - GAME.allySpacing;
  }

  // ----------------------------------------------------------------- turrets

  private updateTurrets(dt: number): void {
    for (const team of TEAMS) {
      const ts = this.teams[team];
      const enemies = this.alive[opposite(team)];
      for (const turret of this.bases[team].turrets) {
        turret.cooldown = Math.max(0, turret.cooldown - dt);
        if (turret.cooldown > 0 || enemies.length === 0) continue;

        const atk = turret.def.attack;
        const target = nearestInLane(enemies, turret.x);
        if (!target) continue;
        const range = ts.stat('turrets', 'range', atk.range);
        if (Math.abs(target.x - turret.x) - target.def.radius > range) continue;

        turret.cooldown = ts.stat('turrets', 'cooldown', atk.cooldown);
        this.launchAttack(
          team, 'turret', turret.index, atk, ts.stat('turrets', 'damage', atk.damage),
          turret.x, turret.def.muzzleHeight, turret.z, target, null,
        );
      }
    }
  }

  private equipTurrets(team: Team): void {
    const base = this.bases[team];
    const def = lookup(this.content.turrets, currentAge(this.content, this.teams[team]).turretId, 'turret');
    base.turrets = GAME.turretMounts.map(
      (m, i) => new Turret(i, def, base.x + teamDir(team) * m.forward, m.side),
    );
  }

  // ------------------------------------------------------------------ combat

  private launchAttack(
    team: Team,
    sourceKind: 'unit' | 'turret',
    sourceId: number,
    attack: AttackDef,
    damage: number,
    ox: number,
    oy: number,
    oz: number,
    targetUnit: Unit | null,
    targetBase: Team | null,
  ): void {
    this.events.push({ type: 'attack', team, sourceKind, sourceId });
    if (attack.projectileId) {
      this.launchProjectile(team, attack.projectileId, damage, ox, oy, oz, targetUnit, targetBase);
    } else if (targetUnit) {
      this.damageUnit(targetUnit, damage, team);
    } else if (targetBase) {
      this.damageBase(this.bases[targetBase], damage);
    }
  }

  private launchProjectile(
    team: Team,
    defId: string,
    damage: number,
    ox: number,
    oy: number,
    oz: number,
    targetUnit: Unit | null,
    targetBase: Team | null,
  ): void {
    const p = this.projectilePool.pop() ?? new Projectile();
    p.id = this.nextProjectileId++;
    p.def = lookup(this.content.projectiles, defId, 'projectile');
    p.team = team;
    p.damage = damage;
    p.x = ox;
    p.y = oy;
    p.z = oz;
    p.startY = oy;
    p.vx = p.vy = p.vz = 0;
    p.targetUnit = targetUnit;
    p.targetBase = targetBase;
    p.lost = false;
    this.aimAtTarget(p);
    p.d0 = Math.max(0.001, Math.hypot(p.tx - ox, p.tz - oz));
    this.projectiles.push(p);
    this.events.push({ type: 'projectileFired', projectileId: p.id, defId, team, x: ox, y: oy, z: oz });
  }

  private aimAtTarget(p: Projectile): void {
    if (p.targetUnit) {
      p.tx = p.targetUnit.x;
      p.ty = p.targetUnit.def.aimHeight;
      p.tz = p.targetUnit.z;
    } else if (p.targetBase) {
      p.tx = this.bases[p.targetBase].x;
      p.ty = GAME.baseAimHeight;
      p.tz = 0;
    }
  }

  private updateProjectiles(dt: number): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i]!;
      if (p.targetUnit) {
        if (p.targetUnit.alive) this.aimAtTarget(p);
        else {
          p.lost = true;
          p.targetUnit = null;
        }
      } else if (p.targetBase) {
        this.aimAtTarget(p);
      }

      const dx = p.tx - p.x;
      const dz = p.tz - p.z;
      const dist = Math.hypot(dx, dz);
      const step = p.def.speed * dt;

      if (dist <= step) {
        this.impactProjectile(p);
        this.projectiles[i] = this.projectiles[this.projectiles.length - 1]!;
        this.projectiles.pop();
        this.projectilePool.push(p);
        continue;
      }

      const oldY = p.y;
      p.x += (dx / dist) * step;
      p.z += (dz / dist) * step;
      const f = Math.min(1, Math.max(0, 1 - (dist - step) / p.d0));
      p.y = p.startY + (p.ty - p.startY) * f + p.def.arcHeight * 4 * f * (1 - f);
      p.vx = (dx / dist) * p.def.speed;
      p.vz = (dz / dist) * p.def.speed;
      p.vy = (p.y - oldY) / dt;
    }
  }

  private impactProjectile(p: Projectile): void {
    p.x = p.tx;
    p.y = p.ty;
    p.z = p.tz;
    const hit = !p.lost;
    this.events.push({ type: 'projectileImpact', projectileId: p.id, defId: p.def.id, hit, x: p.x, y: p.y, z: p.z });
    if (!hit) return;
    if (p.targetUnit) this.damageUnit(p.targetUnit, p.damage, p.team);
    else if (p.targetBase) this.damageBase(this.bases[p.targetBase], p.damage);
    p.targetUnit = null;
    p.targetBase = null;
  }

  private damageUnit(unit: Unit, amount: number, sourceTeam: Team): void {
    if (!unit.alive || unit.health <= 0) return; // already dying this tick
    unit.health -= amount;
    unit.lastHitBy = sourceTeam;
    this.events.push({
      type: 'hit', targetKind: 'unit', targetId: unit.id, team: unit.team,
      damage: amount, x: unit.x, y: unit.def.aimHeight, z: unit.z,
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

  /** Resolve deaths after all attacks this tick so trades are symmetric. */
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
        if (u.lastHitBy) {
          const killer = this.teams[u.lastHitBy];
          killer.gold += u.def.goldReward;
          killer.xp += u.def.xpReward;
        }
        this.events.push({ type: 'death', unitId: u.id, team: u.team, killerTeam: u.lastHitBy });
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

/** First index whose unit x is >= v (list sorted ascending by x). */
function firstIndexAtLeast(list: readonly Unit[], v: number): number {
  let lo = 0;
  let hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (list[mid]!.x < v) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Unit whose x is closest to `x` in a lane-sorted list. */
function nearestInLane(list: readonly Unit[], x: number): Unit | undefined {
  const i = firstIndexAtLeast(list, x);
  const a = list[i - 1];
  const b = list[i];
  if (!a) return b;
  if (!b) return a;
  return x - a.x <= b.x - x ? a : b;
}

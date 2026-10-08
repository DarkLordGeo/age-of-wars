/**
 * Shapes of all gameplay content. Content files (units.ts, ages.ts, ...) are plain data
 * that satisfy these types; the simulation never hardcodes an individual unit or age.
 *
 * Combat follows the original game (docs/AGE1_SPEC.md): one lane, every unit fights the enemy
 * team's front unit, melee and ranged attacks run on separate timers, turrets fire physical
 * projectiles that hit the first enemy they touch.
 */

export type Role = 'melee' | 'ranged' | 'tank';

export interface MeleeAttack {
  damage: number;
  /** Max front-to-front distance (m) to the enemy front unit (or the base edge). */
  range: number;
  /** Seconds from coming into range to the first hit. */
  firstHit: number;
  /** Seconds between later hits. */
  interval: number;
}

export interface RangedAttack {
  damage: number;
  /** Max distance (m) measured as front-to-front gap minus GAME.minUnitGap. */
  range: number;
  /** Seconds between shots while standing / while still walking. */
  intervalStanding: number;
  intervalWalking: number;
  /** Cosmetic projectile shown flying to the target (the hit itself is instant). */
  projectileId: string;
}

export interface UnitDef {
  id: string;
  name: string;
  role: Role;
  /** Key into the asset manifest. */
  modelKey: string;
  cost: number;
  /** Seconds this unit occupies the head of the production queue. */
  spawnTime: number;
  maxHealth: number;
  /** Metres per second. */
  speed: number;
  /**
   * Body length (m) along the lane. A unit's x is its front; the body extends this far behind
   * it, and allies queue behind the body.
   */
  length: number;
  /** Height (m) of the body, for projectile collisions and aim points. */
  height: number;
  melee: MeleeAttack;
  ranged?: RangedAttack;
}

export interface ProjectileDef {
  id: string;
  /** Metres per second. */
  speed: number;
  /** Visual size (m). */
  size: number;
  color: number;
  /** Peak height (m) of the cosmetic arc for instant-hit unit shots. */
  arcHeight: number;
  /** Mesh family the renderer uses. */
  shape: 'stone' | 'egg' | 'boulder';
}

export interface TurretDef {
  id: string;
  name: string;
  modelKey: string;
  cost: number;
  damage: number;
  /** Euclidean reach (m) from the turret on its slot to the enemy front unit. */
  range: number;
  /** Seconds from a target entering range to the first shot. */
  firstShot: number;
  /** Seconds between later shots. */
  interval: number;
  projectileId: string;
  /** Catapult quirk: in the lowest slot it cannot aim closer than this (m). */
  minAimDistanceSlot0?: number;
}

export interface AgeDef {
  id: string;
  name: string;
  /** Total XP needed to enter this age (0 for the first). */
  xpRequired: number;
  /** Base HP in this age (current HP rises by the difference on evolving). */
  baseHealth: number;
  /** Trainable units in tier order (all available from the start of the age). */
  units: string[];
  /** Buildable turrets in tier order. */
  turrets: string[];
  /** Upgrade ids purchasable during (and after) this age (the original has none). */
  upgrades: string[];
}

export type ModScope = 'units' | 'turrets' | 'base';
export type ModStat = 'damage' | 'maxHealth' | 'speed' | 'range' | 'cooldown' | 'income';

/** result = (base + sum(add)) * product(mul) */
export interface Modifier {
  scope: ModScope;
  stat: ModStat;
  op: 'add' | 'mul';
  value: number;
}

export interface UpgradeDef {
  id: string;
  name: string;
  description: string;
  cost: number;
  effects: Modifier[];
  /** Upgrade ids that must be owned first. */
  requires?: string[];
}

export type AiTurretAction = { at: number; action: 'build'; turretId: string; slot: number } | { at: number; action: 'sell'; slot: number };

/**
 * The original enemy behaviour (docs/AGE1_SPEC.md, section 10). It does not spend gold.
 */
export interface AiProfile {
  id: string;
  /** Enemy unit HP and damage multiplier for this difficulty. */
  statMultiplier: number;
  /** Seconds between spawn rolls, and the chance per roll. */
  rollInterval: number;
  spawnChance: number;
  /** No new units while this many are on the field. */
  maxUnits: number;
  /** Seconds into the age when each unit tier becomes available (tier 0 at 0). */
  tierUnlock: number[];
  /** Scripted turret builds/sales, seconds into the age. */
  turretScript: AiTurretAction[];
  seed: number;
}

export interface Content {
  units: Record<string, UnitDef>;
  projectiles: Record<string, ProjectileDef>;
  turrets: Record<string, TurretDef>;
  /** Ordered; index 0 is the starting age. */
  ages: AgeDef[];
  upgrades: Record<string, UpgradeDef>;
  ai: Record<string, AiProfile>;
}

export function lookup<T>(table: Record<string, T>, id: string, kind: string): T {
  const v = table[id];
  if (!v) throw new Error(`Unknown ${kind}: ${id}`);
  return v;
}

/**
 * Shapes of all gameplay content. Content files (units.ts, ages.ts, ...) are plain data
 * that satisfy these types; the simulation never hardcodes an individual unit or age.
 */

export type Role = 'melee' | 'ranged' | 'tank';

export interface AttackDef {
  damage: number;
  /** Edge-to-edge reach along the lane. */
  range: number;
  /** Seconds between attacks. */
  cooldown: number;
  /** When set the attack fires this projectile; otherwise damage is instant (melee). */
  projectileId?: string;
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
  /** Body radius along the lane. */
  radius: number;
  /** Edge-to-edge distance at which the unit notices enemies and moves to engage. */
  detectionRange: number;
  attack: AttackDef;
  /** Heights (m) for projectile spawn / projectile aim point. */
  muzzleHeight: number;
  aimHeight: number;
  /** Granted to the team that lands the killing blow. */
  goldReward: number;
  xpReward: number;
}

export interface ProjectileDef {
  id: string;
  /** Metres per second. */
  speed: number;
  /** Peak height (m) of the parabolic arc; 0 flies straight. */
  arcHeight: number;
  /** Placeholder visual size (m) and colour. */
  size: number;
  color: number;
}

export interface TurretDef {
  id: string;
  name: string;
  modelKey: string;
  muzzleHeight: number;
  /** Turrets must use a projectile attack. */
  attack: AttackDef;
}

export interface AgeUnlock {
  unitId: string;
  /** Total XP the team needs before this unit can be trained. */
  unlockXp: number;
}

export interface AgeDef {
  id: string;
  name: string;
  /** Total XP needed to enter this age (0 for the first). */
  xpRequired: number;
  /** Turret mounted on every base turret mount while in this age. */
  turretId: string;
  units: AgeUnlock[];
  /** Upgrade ids purchasable during (and after) this age. */
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

export interface AiProfile {
  id: string;
  /** Seconds between decisions. */
  thinkInterval: number;
  /** Enemy economy scaling relative to the player's. */
  incomeMultiplier: number;
  startGold: number;
  /** Max items the AI keeps in its production queue. */
  maxQueue: number;
  /** Gold held back from unit purchases when not under pressure. */
  goldReserve: number;
  /** Player front within this distance (m) of the AI base counts as a threat. */
  threatDistance: number;
  /** Army-strength ratio (mine/theirs) above which the AI feels it is winning. */
  aggressionRatio: number;
  /** Desired share of each role in the army. */
  roleMix: Record<Role, number>;
  /** Weight of situational preferences (fast units when threatened, strong when winning). */
  reactivity: number;
  /** Random tie-breaking noise added to unit scores. */
  randomness: number;
  buyUpgrades: boolean;
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

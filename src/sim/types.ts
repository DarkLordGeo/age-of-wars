export type Team = 'player' | 'enemy';

export const opposite = (t: Team): Team => (t === 'player' ? 'enemy' : 'player');

/** Direction of travel along +X for each team. */
export const teamDir = (t: Team): 1 | -1 => (t === 'player' ? 1 : -1);

export const TEAMS: readonly Team[] = ['player', 'enemy'];

export type UnitState = 'advancing' | 'attacking' | 'waiting' | 'dead';

export type GameStatus = 'playing' | 'victory' | 'defeat';

export type EnqueueResult = 'ok' | 'game-over' | 'unknown-unit' | 'locked' | 'unaffordable' | 'queue-full';

export type TurretResult = 'ok' | 'game-over' | 'unknown-turret' | 'locked' | 'unaffordable' | 'no-free-slot' | 'slot-taken' | 'empty-slot';

export type SlotResult = 'ok' | 'game-over' | 'max-slots' | 'unaffordable';

/**
 * One-shot facts emitted by the simulation. Presentation (visual effects, audio, HUD toasts)
 * subscribes to these; the sim never depends on who is listening.
 */
export type SimEvent =
  | { type: 'spawn'; unitId: number; team: Team }
  | { type: 'attack'; team: Team; sourceKind: 'unit' | 'turret'; sourceId: number; mode: 'melee' | 'ranged' }
  | { type: 'projectileFired'; projectileId: number; defId: string; team: Team; x: number; y: number; z: number }
  | { type: 'projectileImpact'; projectileId: number; defId: string; hit: boolean; x: number; y: number; z: number }
  | { type: 'hit'; targetKind: 'unit' | 'base'; targetId: number; team: Team; damage: number; x: number; y: number; z: number }
  | { type: 'death'; unitId: number; team: Team; killerTeam: Team }
  | { type: 'baseDamage'; team: Team; damage: number; health: number }
  | { type: 'turretBuilt'; team: Team; slot: number; turretId: string }
  | { type: 'turretSold'; team: Team; slot: number; turretId: string; refund: number }
  | { type: 'slotBought'; team: Team; slots: number }
  | { type: 'ageAdvanced'; team: Team; ageId: string }
  | { type: 'upgradePurchased'; team: Team; upgradeId: string }
  | { type: 'victory' }
  | { type: 'defeat' };

export type SimEventType = SimEvent['type'];

import { u } from './original';

/**
 * Global tunables. Units are metres; the battle lane runs along the X axis.
 * Economy and spacing rules follow the original game (docs/AGE1_SPEC.md sections 1, 9, 12, 13).
 */
export const GAME = {
  /** Fixed simulation step (seconds). */
  fixedStep: 1 / 60,
  maxFrameDelta: 0.1,

  /** Player base sits at -baseOffset, enemy base at +baseOffset. */
  baseOffset: 40,
  /** Units stop at, and attack, the base edge this far in front of the base centre. */
  baseRadius: 4,
  /** Height (m) projectiles aim at when targeting a base. */
  baseAimHeight: 2.5,

  /**
   * Turret tower: one tower per base, `forward` metres toward the enemy and `side` metres toward
   * the camera. Slots are stacked up it (original heights 20/68/116/164 units).
   */
  turretTower: { forward: 8, side: 6 },
  slotHeights: [u(20), u(68), u(116), u(164)],
  /** Price of the 2nd, 3rd and 4th turret slot (the first is free). */
  slotCosts: [1000, 3000, 7500],
  /** Selling a turret refunds this share of its price. */
  turretSellRefund: 0.5,
  /** Turret projectiles vanish after this many seconds (original 3.5 s). */
  projectileLifetime: 3.5,

  /** Random lateral spread of spawned units (visual only; combat uses X distance). */
  laneHalfWidth: 1.6,
  /** Original MIN_DISTANCE (20 units): gap kept to the ally ahead / the enemy front. */
  minUnitGap: u(20),
  /** How long a corpse stays in the sim so the renderer can play a death animation. */
  corpseLinger: 1.6,

  economy: {
    startGold: 175,
    /** The original has no passive income: gold only comes from kills (and turret sales). */
    baseIncomePerSec: 0,
    queueSize: 5,
    /** Gold for a kill = round(killRewardMultiplier x unit cost). */
    killRewardMultiplier: 1.3,
    /** XP for a kill = this x the kill reward. */
    killXpMultiplier: 2,
    /** XP when one of your own units dies = floor(kill reward x this). */
    ownLossXpMultiplier: 0.5,
  },

  defaultDifficulty: 'normal',
  seed: 1337,
} as const;

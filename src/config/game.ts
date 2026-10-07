/** Global tunables. Units are metres; the battle lane runs along the X axis. */
export const GAME = {
  /** Fixed simulation step (seconds). */
  fixedStep: 1 / 60,
  maxFrameDelta: 0.1,

  /** Player base sits at -baseOffset, enemy base at +baseOffset. */
  baseOffset: 40,
  baseRadius: 4,
  baseMaxHealth: 1000,
  /** Height (m) projectiles aim at when targeting a base. */
  baseAimHeight: 2.5,

  /**
   * Turret mounts per base. `forward` is metres from the base centre toward the enemy,
   * `side` is the lateral (z) offset. One turret (of the current age's type) per mount.
   */
  turretMounts: [{ forward: 8, side: 6 }],

  /** Random lateral spread of spawned units (visual only; combat uses X distance). */
  laneHalfWidth: 1.6,
  /** Extra gap kept between allied units walking in column. */
  allySpacing: 0.15,
  /** How long a corpse stays in the sim so the renderer can play a death animation. */
  corpseLinger: 1.6,

  economy: {
    startGold: 100,
    /** Passive gold per second for every team (before multipliers/upgrades). */
    baseIncomePerSec: 5,
    queueSize: 5,
  },

  defaultDifficulty: 'normal',
  seed: 1337,
} as const;

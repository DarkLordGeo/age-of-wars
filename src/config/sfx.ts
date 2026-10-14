import type { SoundCue } from '../audio/AudioHooks';

/**
 * Sound effects. `files` are URLs of files under public/audio/sfx/ (one take is picked per play,
 * so a few takes of the same sound avoid repetition); a cue with no files is silent.
 * docs/ASSET_LICENSES.md must list each file before it is added.
 *
 * Mixing: `volume` is the cue's gain on the sfx channel; `maxVoices` caps how many copies play at
 * once and `minGap` (s) drops repeats closer than that, so a big fight doesn't stack 20 thuds;
 * `pitch` is a random +-playback-rate spread and `volumeJitter` a random +-gain share per play.
 * `order`: takes picked at random, or in turn (`alternate`, in `files` order).
 */
export interface SfxDef {
  files: string[];
  volume: number;
  maxVoices: number;
  minGap: number;
  pitch: number;
  volumeJitter?: number;
  order?: 'random' | 'alternate';
}

const cue = (volume: number, maxVoices: number, minGap: number, pitch: number, extra: Partial<SfxDef> = {}): SfxDef => ({ files: [], volume, maxVoices, minGap, pitch, ...extra });

export const SFX: Record<SoundCue, SfxDef> = {
  /** Club wind-up: short, weighty air whoosh (when the swing starts, before the blow). */
  club_swing: cue(0.45, 3, 0.06, 0.08),
  /** Spear thrust whoosh (Dino Rider). */
  spear_swing: cue(0.4, 2, 0.08, 0.06),
  /** Club connects: solid wooden thud with a crunch (at the damage moment). */
  club_hit: cue(0.7, 3, 0.05, 0.1),
  /** Spear connects: sharper thrust impact, leathery. */
  spear_hit: cue(0.7, 2, 0.08, 0.08),
  /**
   * A unit takes damage (only blows that deal damage): a pained grunt and a blunt hammer impact,
   * in turn, each a little different in pitch and level.
   */
  unit_hurt: cue(0.55, 3, 0.07, 0.07, {
    files: ['/audio/sfx/hit-grunt.mp3', '/audio/sfx/hit-hammer.mp3'],
    volumeJitter: 0.15,
    order: 'alternate',
  }),
  /** Slingshot Man lets a stone go. */
  sling_fire: cue(0.35, 3, 0.05, 0.1),
  /** A turret fires (sling snap / mechanical release). */
  turret_fire: cue(0.5, 2, 0.08, 0.06),
  /** A stone (turret shot or sling stone) hits a unit: thwack/crack. */
  stone_hit: cue(0.6, 3, 0.05, 0.1),
  /** A shot lands on the ground. */
  stone_miss: cue(0.25, 2, 0.1, 0.12),
  /** A blow lands on a base: heavier rock impact. */
  structure_hit: cue(0.75, 2, 0.15, 0.06),
  /** A unit dies: a short male death cry, once per death (capped when many fall at once). */
  unit_death: cue(0.5, 2, 0.12, 0.06, { files: ['/audio/sfx/death-male.mp3'], volumeJitter: 0.1 }),
  unit_spawn: cue(0.3, 1, 0.2, 0.04),
  age_up: cue(0.8, 1, 0, 0),
  victory: cue(0.9, 1, 0, 0),
  defeat: cue(0.9, 1, 0, 0),
};

/** Weapon sound family per unit id (melee swing/hit cues). */
export const UNIT_WEAPON: Record<string, 'club' | 'spear'> = {
  clubman: 'club',
  slingshot: 'club', // in melee the Slingshot Man clubs with his fists/sling stone
  dino: 'spear',
};

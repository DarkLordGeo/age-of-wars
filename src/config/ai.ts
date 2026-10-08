import { frames } from './original';
import type { AiProfile, AiTurretAction } from './schema';

/**
 * The original enemy AI (docs/AGE1_SPEC.md section 10, extracted from the game's ActionScript by
 * Age-of-war-unity-clone Enemy_AI.cs): every second a 30 % chance to train a random unlocked unit
 * while it has fewer than 6 on the field; tier 2 after 1500 frames, tier 3 after 5000; a fixed
 * turret script. It does not spend gold.
 *
 * Difficulty scales the AI's unit HP and damage. The original's exact Easy/Normal/Hard factors
 * are not in the sources; 1.0 / 1.2 / 1.5 follow the clone's trainer settings (INFERRED).
 */
const AGE1_TURRETS: AiTurretAction[] = [
  { at: frames(1000), action: 'build', turretId: 'rock_slingshot', slot: 0 },
  { at: frames(3950), action: 'sell', slot: 0 },
  { at: frames(4000), action: 'build', turretId: 'egg_automatic', slot: 0 },
  { at: frames(5950), action: 'sell', slot: 0 },
  { at: frames(6000), action: 'build', turretId: 'primitive_catapult', slot: 0 },
];

const base = {
  rollInterval: 1,
  spawnChance: 0.3,
  maxUnits: 6,
  tierUnlock: [0, frames(1500), frames(5000)],
  turretScript: AGE1_TURRETS,
};

export const AI_PROFILES: Record<string, AiProfile> = {
  easy: { id: 'easy', statMultiplier: 1.0, ...base, seed: 11 },
  normal: { id: 'normal', statMultiplier: 1.2, ...base, seed: 22 },
  hard: { id: 'hard', statMultiplier: 1.5, ...base, seed: 33 },
};

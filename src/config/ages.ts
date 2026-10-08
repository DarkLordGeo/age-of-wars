import type { AgeDef } from './schema';

/**
 * Ordered ages. Only the first is playable for now; append entries to add more.
 * Age 1 (original "cave" age): base HP 500, 4000 XP to evolve (docs/AGE1_SPEC.md section 1).
 */
export const AGES: AgeDef[] = [
  {
    id: 'stone',
    name: 'Stone Age',
    xpRequired: 0,
    baseHealth: 500,
    units: ['clubman', 'slingshot', 'dino'],
    turrets: ['rock_slingshot', 'egg_automatic', 'primitive_catapult'],
    upgrades: [],
  },
];

/** XP needed to leave the last defined age (age 2 is not implemented yet). */
export const NEXT_AGE_XP = 4000;

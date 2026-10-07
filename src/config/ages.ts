import type { AgeDef } from './schema';

/** Ordered ages. Only the first is playable for now; append entries to add more. */
export const AGES: AgeDef[] = [
  {
    id: 'dawn',
    name: 'Dawn Age',
    xpRequired: 0,
    turretId: 'watchtower',
    units: [
      { unitId: 'soldier', unlockXp: 0 },
      { unitId: 'archer', unlockXp: 60 },
      { unitId: 'brute', unlockXp: 200 },
    ],
    upgrades: ['sharpened_weapons', 'hardened_armor', 'reinforced_walls', 'ballista_tuning', 'trade_routes'],
  },
];

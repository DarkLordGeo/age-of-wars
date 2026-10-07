import type { UpgradeDef } from './schema';

export const UPGRADES: Record<string, UpgradeDef> = {
  sharpened_weapons: {
    id: 'sharpened_weapons',
    name: 'Sharpened Weapons',
    description: '+15% unit damage',
    cost: 120,
    effects: [{ scope: 'units', stat: 'damage', op: 'mul', value: 1.15 }],
  },
  hardened_armor: {
    id: 'hardened_armor',
    name: 'Hardened Armor',
    description: '+20% health for newly trained units',
    cost: 150,
    effects: [{ scope: 'units', stat: 'maxHealth', op: 'mul', value: 1.2 }],
  },
  reinforced_walls: {
    id: 'reinforced_walls',
    name: 'Reinforced Walls',
    description: '+500 base health',
    cost: 200,
    effects: [{ scope: 'base', stat: 'maxHealth', op: 'add', value: 500 }],
  },
  ballista_tuning: {
    id: 'ballista_tuning',
    name: 'Tuned Turret',
    description: '+30% turret damage, +3m range',
    cost: 140,
    effects: [
      { scope: 'turrets', stat: 'damage', op: 'mul', value: 1.3 },
      { scope: 'turrets', stat: 'range', op: 'add', value: 3 },
    ],
  },
  trade_routes: {
    id: 'trade_routes',
    name: 'Trade Routes',
    description: '+2 gold per second',
    cost: 100,
    effects: [{ scope: 'base', stat: 'income', op: 'add', value: 2 }],
  },
};

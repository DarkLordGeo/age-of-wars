import type { TurretDef } from './schema';

export const TURRETS: Record<string, TurretDef> = {
  watchtower: {
    id: 'watchtower',
    name: 'Watchtower',
    modelKey: 'turret.watchtower',
    muzzleHeight: 5.5,
    attack: { damage: 20, range: 16, cooldown: 1.5, projectileId: 'bolt' },
  },
};

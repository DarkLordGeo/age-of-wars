import { Group } from 'three';
import { AssetLibrary } from './AssetLibrary';
import { decorateBiped, prepareBiped } from '../render/age1/autorig';
import { createDinoRider } from '../render/age1/dino';
import { createEggAutomatic, createPrimitiveCatapult, createRockSlingshot } from '../render/age1/turrets';
import { createSettlement } from '../render/age1/settlement';
import { createArcherPlaceholder, createSoldierPlaceholder } from './placeholders';
import { SCENERY } from './scenery';

/**
 * Every model the game can show. To replace a placeholder with a Blender export, drop the
 * .glb in /public/models and add `url: '/models/soldier.glb'` to its entry
 * (contract: docs/ASSET_SPEC.md; `expectedHeight` enables the scale/origin check).
 */
export function createAssetLibrary(): AssetLibrary {
  const lib = new AssetLibrary();
  // Clubman and Slingshot Man: Rodin (Hyper3D) models made for this game, baked to ~14k tris with
  // vertex colours (assets_src/rodin). They ship without a skeleton, so they are auto-rigged on
  // load (legs + torso) and animated procedurally. The soldier rig remains the fallback.
  lib.register('unit.clubman', {
    url: '/models/caveman_club.glb',
    placeholder: createSoldierPlaceholder,
    expectedHeight: 1.8,
    prepare: (scene) => prepareBiped(scene, { height: 1.8 }),
    decorate: (m, tint) => decorateBiped(m, tint, { swing: 0.55 }),
  });
  lib.register('unit.slingshot', {
    url: '/models/caveman_slingshot.glb',
    placeholder: createArcherPlaceholder,
    expectedHeight: 1.8,
    prepare: (scene) => prepareBiped(scene, { height: 1.8 }),
    decorate: (m, tint) => decorateBiped(m, tint, { swing: 0.25 }),
  });
  lib.register('unit.dino', { placeholder: createDinoRider });
  // Imported stone hut, placed inside each camp (falls back to a thatched hut when missing).
  lib.register('prop.stone_hut', { url: '/models/stone_hut.glb', placeholder: () => new Group() });
  lib.register('base.keep', {
    placeholder: (tint) =>
      createSettlement(tint, {
        variant: tint % 2,
        building: lib.hasModel('prop.stone_hut') ? lib.instantiate('prop.stone_hut', tint) : undefined,
      }),
  });
  lib.register('turret.rock_slingshot', { placeholder: () => createRockSlingshot() });
  lib.register('turret.egg_automatic', { placeholder: createEggAutomatic });
  lib.register('turret.primitive_catapult', { placeholder: () => createPrimitiveCatapult() });
  // Environment/prop library (docs/ASSET_LICENSES.md). No placeholder: the environment falls
  // back to its procedural scenery when a model is missing. Unused entries are lazy.
  for (const a of SCENERY) lib.register(a.key, { url: a.url, placeholder: () => new Group(), lazy: !a.preload });
  return lib;
}

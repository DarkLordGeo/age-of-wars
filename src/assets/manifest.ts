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
  // Clubman: Rodin (Hyper3D) caveman auto-rigged by Mixamo, with Mixamo clips, a club in the right
  // fist and a TeamColor belt (assets_src/rodin/mixamo_build.py).
  lib.register('unit.clubman', {
    url: '/models/clubman.glb',
    placeholder: createSoldierPlaceholder,
    expectedHeight: 1.8,
    strike: 0.3, // attack clip: the club comes down ~9 frames in (Double Dagger Stab 26-46)
  });
  // Slingshot Man: Rodin model baked to ~14k tris with vertex colours (assets_src/rodin). It ships
  // without a skeleton, so it is auto-rigged on load (legs + torso) and animated procedurally.
  lib.register('unit.slingshot', {
    url: '/models/caveman_slingshot.glb',
    placeholder: createArcherPlaceholder,
    expectedHeight: 1.8,
    prepare: (scene) => prepareBiped(scene, { height: 1.8 }),
    decorate: (m, tint) => decorateBiped(m, tint, { swing: 0.25 }),
  });
  // Dino Rider: procedural dinosaur; the rider is the rigged Rodin caveman (model g, seated pose
  // and spear) when it loads, else the procedural rider.
  lib.register('char.dino_rider', { url: '/models/dino_rider.glb', placeholder: () => new Group() });
  lib.register('unit.dino', {
    // Rodin dinosaur rigged in Blender with the rider seated on it, one set of clips for both
    // (assets_src/rodin/rig_dino.py). Without it, the procedural dinosaur below is the fallback.
    url: '/models/dino.glb',
    expectedHeight: 3.2,
    strike: 0.34, // attack clip: the horns connect as the ram peaks (rig_dino.py)
    placeholder: (tint) =>
      createDinoRider(
        tint,
        lib.hasModel('char.dino_rider') ? { model: lib.instantiate('char.dino_rider', tint), clips: lib.clipsFor('char.dino_rider') } : undefined,
      ),
  });
  // The base is Lasha's stone cave (Rodin); without it the procedural camp is the fallback.
  lib.register('prop.stone_hut', { url: '/models/stone_hut.glb', placeholder: () => new Group() });
  lib.register('base.keep', {
    placeholder: (tint) =>
      createSettlement(tint, {
        variant: tint % 2,
        cave: lib.hasModel('prop.stone_hut') ? lib.instantiate('prop.stone_hut', tint) : undefined,
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

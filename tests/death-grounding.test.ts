import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { AssetLibrary, type LoadedGltf } from '../src/assets/AssetLibrary';
import { createArcherPlaceholder } from '../src/assets/placeholders';
import { lowestPoint } from '../src/render/grounding';
import { terrainHeight } from '../src/render/terrain';
import { UnitView } from '../src/render/UnitView';
import { DT, makeWorld } from './helpers';

// Node has no image decoding: stub it so GLTFLoader can parse embedded textures (geometry only).
(globalThis as { self?: unknown }).self ??= globalThis;
(globalThis as { createImageBitmap?: unknown }).createImageBitmap ??= async () => ({ width: 1, height: 1, close() {} });

async function library(): Promise<AssetLibrary> {
  const lib = new AssetLibrary();
  const load = async (key: string, file: string, height: number): Promise<void> => {
    lib.register(key, { placeholder: createArcherPlaceholder, expectedHeight: height });
    const buf = readFileSync(join(import.meta.dirname, '..', 'public', 'models', file));
    const gltf = await new GLTFLoader().parseAsync(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, '');
    lib.registerLoaded(key, gltf as LoadedGltf);
  };
  await load('unit.clubman', 'clubman.glb', 1.8);
  await load('unit.dino', 'dino.glb', 3.2);
  lib.register('unit.slingshot', { placeholder: createArcherPlaceholder }); // procedural fall
  return lib;
}

/**
 * Kill the unit and play its death through the corpse linger, checking every frame that the
 * lowest posed point is on the ground (not under it, not floating). Returns the death take used.
 */
function dieOnGround(lib: AssetLibrary, unitId: 'clubman' | 'dino' | 'slingshot', x: number, earlier = 0): string {
  const w = makeWorld();
  for (let i = 0; i < earlier; i++) w.spawnUnit('enemy', 'clubman', 30); // other unit ids -> other seeds
  const unit = w.spawnUnit('player', unitId, x);
  const key = unit.def.modelKey;
  const view = new UnitView(key, lib.instantiate(key, 0x3366ff), lib.clipsFor(key), { variants: lib.clipVariantsFor(key) });
  view.bind(unit);
  unit.state = 'dead';
  for (let t = 0; t < 1.6; t += DT * 2) {
    unit.deadFor = t;
    view.update(DT * 2, null);
    const ground = terrainHeight(view.root.position.x, view.root.position.z);
    const low = lowestPoint(view.root, 6000); // denser than the game's own sample
    assert.ok(low > ground - 0.05, `${unitId}: ${(ground - low).toFixed(3)} m under the ground at t=${t.toFixed(2)}`);
    assert.ok(low < ground + 0.05, `${unitId}: floating ${(low - ground).toFixed(3)} m at t=${t.toFixed(2)}`);
  }
  return view.animator?.playingClip?.name ?? 'procedural';
}

describe('death grounding (all units stay on top of the battlefield)', () => {
  it('Clubman: both death takes', async () => {
    const lib = await library();
    const takes = new Set<string>();
    for (let i = 0; i < 12 && takes.size < 2; i++) takes.add(dieOnGround(lib, 'clubman', -20 + 3 * i, i));
    assert.deepEqual([...takes].sort(), ['death', 'death_2'], 'both takes exercised');
  });

  it('Dino Rider: dinosaur and rider collapse together onto the ground', async () => {
    const lib = await library();
    dieOnGround(lib, 'dino', -4);
  });

  it('procedural fall (placeholder models, e.g. the Slingshot Man fallback)', async () => {
    const lib = await library();
    assert.equal(dieOnGround(lib, 'slingshot', 3), 'procedural');
  });
});

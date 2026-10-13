import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { AssetLibrary, type LoadedGltf } from '../src/assets/AssetLibrary';
import { createSoldierPlaceholder } from '../src/assets/placeholders';
import { GAME } from '../src/config/game';
import { combatTarget, FACING, UnitView, yawToward } from '../src/render/UnitView';
import { teamDir } from '../src/sim/types';
import type { Unit } from '../src/sim/Unit';
import type { World } from '../src/sim/World';
import { DT, makeWorld } from './helpers';
import { buildTestRigGlb } from './fixtures/testRig';

async function library(): Promise<AssetLibrary> {
  const lib = new AssetLibrary();
  lib.register('unit.clubman', { placeholder: createSoldierPlaceholder, expectedHeight: 1.8, strike: 0.3 });
  lib.registerLoaded('unit.clubman', (await new GLTFLoader().parseAsync(buildTestRigGlb(), '')) as LoadedGltf);
  return lib;
}

const angle = (a: number, b: number): number => Math.abs(Math.atan2(Math.sin(b - a), Math.cos(b - a)));

/** Drive the sim and the views like GameRenderer.render, checking turn rate and direction each frame. */
function fight(lib: AssetLibrary, w: World, units: Unit[], seconds: number): Map<number, UnitView> {
  const views = new Map(units.map((u) => [u.id, new UnitView('k', lib.instantiate('unit.clubman', 1), lib.clipsFor('unit.clubman'))] as const));
  for (const u of units) views.get(u.id)!.bind(u);
  const drawnAt = (u: Unit) => views.get(u.id)?.root.position;
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    w.step(DT);
    w.drainEvents(() => undefined);
    for (const v of views.values()) {
      if (!v.unit.alive) continue;
      v.setTarget(combatTarget(w, v.unit, drawnAt));
      const before = v.heading;
      v.update(DT, null);
      assert.ok(angle(before, v.heading) <= FACING.turnRate * DT + 1e-9, 'turns smoothly, no snapping');
      // Never faces backwards relative to its march direction.
      assert.ok(Math.cos(v.heading - (teamDir(v.unit.team) === 1 ? 0 : Math.PI)) > 0, `${v.unit.team} faces the enemy side`);
    }
  }
  return views;
}

function facesEachOther(a: UnitView, b: UnitView): void {
  const pa = a.root.position;
  const pb = b.root.position;
  assert.ok(angle(a.heading, yawToward(pb.x - pa.x, pb.z - pa.z)) < 0.06, `${a.unit.team} looks at its opponent`);
  assert.ok(angle(b.heading, yawToward(pa.x - pb.x, pa.z - pb.z)) < 0.06, `${b.unit.team} looks at its opponent`);
}

describe('melee facing (render)', () => {
  for (const [label, at] of [['beside the player cave', -GAME.baseOffset + 6], ['beside the enemy cave', GAME.baseOffset - 9], ['mid-lane', 0]] as const) {
    it(`both fighters face each other ${label}, off-axis in the lane`, async () => {
      const lib = await library();
      // Several seeds: the lane's sideways spread puts fighters at different z.
      let offAxis = 0;
      for (const seed of [3, 7, 11, 19]) {
        const w = makeWorld({ seed });
        const a = w.spawnUnit('player', 'clubman', at - 2);
        const b = w.spawnUnit('enemy', 'clubman', at + 2);
        a.health = b.health = 1e6;
        const views = fight(lib, w, [a, b], 3);
        assert.equal(a.state, 'attacking');
        assert.equal(b.state, 'attacking');
        facesEachOther(views.get(a.id)!, views.get(b.id)!);
        if (Math.abs(a.z - b.z) > 0.5) offAxis++;
      }
      assert.ok(offAxis > 0, 'at least one off-axis pair exercised');
    });
  }

  it('a unit attacking the enemy cave (no enemy units left) faces the base', async () => {
    const lib = await library();
    const w = makeWorld({ seed: 5 });
    const a = w.spawnUnit('player', 'clubman', GAME.baseOffset - 8);
    a.health = 1e6;
    const views = fight(lib, w, [a], 3);
    assert.equal(a.state, 'attacking');
    const v = views.get(a.id)!;
    const p = v.root.position;
    assert.ok(angle(v.heading, yawToward(w.bases.enemy.x - p.x, 0 - p.z)) < 0.06);
  });

  it('a unit walking (not fighting) faces along its march', async () => {
    const lib = await library();
    const w = makeWorld();
    const a = w.spawnUnit('enemy', 'clubman', 10);
    const views = fight(lib, w, [a], 0.5);
    assert.equal(a.state, 'advancing');
    assert.ok(Math.cos(views.get(a.id)!.heading - Math.PI) > 0.95);
  });
});

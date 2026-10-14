import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { AssetLibrary, type LoadedGltf } from '../src/assets/AssetLibrary';
import { createSoldierPlaceholder } from '../src/assets/placeholders';
import { GAME } from '../src/config/game';
import { UnitView, MELEE_VISUALS } from '../src/render/UnitView';
import { teamDir, type SimEvent } from '../src/sim/types';
import type { World } from '../src/sim/World';
import { DT, makeWorld } from './helpers';
import { buildTestRigGlb } from './fixtures/testRig';

const KEY = 'unit.clubman';
const STRIKE = 0.3;

async function library(): Promise<AssetLibrary> {
  const lib = new AssetLibrary();
  lib.register(KEY, { placeholder: createSoldierPlaceholder, expectedHeight: 1.8, strike: STRIKE });
  lib.registerLoaded(KEY, (await new GLTFLoader().parseAsync(buildTestRigGlb(), '')) as LoadedGltf);
  return lib;
}

function view(lib: AssetLibrary, onSwing?: () => void): UnitView {
  return new UnitView('k', lib.instantiate(KEY, 1), lib.clipsFor(KEY), {
    variants: lib.clipVariantsFor(KEY),
    strike: lib.strikeTimeFor(KEY),
    onSwing,
  });
}

/** Step the sim and every view together, like the game loop; returns the events per tick. */
function run(w: World, views: Map<number, UnitView>, seconds: number, onTick?: (events: SimEvent[]) => void): void {
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    w.step(DT);
    const events: SimEvent[] = [];
    w.drainEvents((e) => events.push(e));
    for (const e of events) {
      if (e.type === 'attack' && e.sourceKind === 'unit') views.get(e.sourceId)?.triggerAttack(e.mode);
      if (e.type === 'hit' && e.targetKind === 'unit') views.get(e.targetId)?.triggerHit();
    }
    for (const v of views.values()) v.update(DT, null);
    onTick?.(events);
  }
}

describe('melee presentation (render only)', () => {
  it('opposing melee units close to a small gap so blows connect, without overlapping', async () => {
    const lib = await library();
    const w = makeWorld();
    const a = w.spawnUnit('player', 'clubman', -6);
    const b = w.spawnUnit('enemy', 'clubman', 2);
    a.health = b.health = 1e6;
    const views = new Map([a, b].map((u) => [u.id, view(lib)] as const));
    for (const [id, v] of views) v.bind(w.units.find((u) => u.id === id)!);
    run(w, views, 4);
    assert.equal(a.state, 'attacking');
    // The sim keeps its original spacing between the units' fronts...
    assert.ok(Math.abs(b.x - a.x - GAME.minUnitGap) < 0.05);
    // ...while the drawn fronts close to MELEE_VISUALS.gap (+ the knock-back of the last blow).
    const front = (u: typeof a): number => views.get(u.id)!.drawX() + teamDir(u.team) * (views.get(u.id) as unknown as { reach: number }).reach;
    const gap = front(b) - front(a);
    assert.ok(gap > 0.3 && gap < MELEE_VISUALS.gap + 2 * MELEE_VISUALS.knock + 0.05, `visual gap ${gap.toFixed(2)} m`);
  });

  it('the swing starts early so the blow lands on the damage tick', async () => {
    const lib = await library();
    const w = makeWorld();
    const a = w.spawnUnit('player', 'clubman', -6);
    const b = w.spawnUnit('enemy', 'clubman', 2);
    a.health = b.health = 1e6;
    let swings = 0;
    const va = view(lib, () => swings++);
    const views = new Map([[a.id, va], [b.id, view(lib)]]);
    va.bind(a);
    views.get(b.id)!.bind(b);
    const strikeTimes: number[] = [];
    run(w, views, 6, (events) => {
      if (events.some((e) => e.type === 'hit' && e.targetKind === 'unit' && e.targetId === b.id)) {
        assert.equal(va.animator!.playing, 'attack', 'swing already running when the damage lands');
        strikeTimes.push(va.animator!.time);
      }
    });
    assert.ok(strikeTimes.length >= 3);
    for (const t of strikeTimes) assert.ok(Math.abs(t - STRIKE) < 2.5 * DT, `clip at ${t.toFixed(3)} s when the hit landed`);
    // One whoosh per blow, plus possibly one swing still in the air when the run stops.
    const inFlight = va.animator!.playing === 'attack' && va.animator!.time < STRIKE ? 1 : 0;
    assert.equal(swings, strikeTimes.length + inFlight, 'one whoosh per blow');
  });

  it('identical units are desynchronised, reproducibly (seeded by unit id)', async () => {
    const lib = await library();
    const w = makeWorld();
    const units = [w.spawnUnit('player', 'clubman', -10), w.spawnUnit('player', 'clubman', -14)];
    for (const u of units) u.moving = false;
    const [v1, v2] = [view(lib), view(lib)];
    v1.bind(units[0]!);
    v2.bind(units[1]!);
    assert.notEqual(v1.animator!.time.toFixed(4), v2.animator!.time.toFixed(4), 'different idle phase');
    const again = view(lib);
    again.bind(units[0]!);
    assert.equal(again.animator!.time, v1.animator!.time, 'same unit -> same phase');
  });
});

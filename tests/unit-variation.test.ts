import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createSoldierPlaceholder } from '../src/assets/placeholders';
import { GAME } from '../src/config/game';
import { UNIT_VARIATION, unitVariation } from '../src/config/variation';
import { gaitLoop, UnitView } from '../src/render/UnitView';
import { ModelAnimator } from '../src/render/ModelAnimator';
import { createRng } from '../src/sim/rng';
import type { Team } from '../src/sim/types';
import type { Unit } from '../src/sim/Unit';
import { DT, makeWorld } from './helpers';
import { AnimationClip, Group, NumberKeyframeTrack, Object3D } from 'three';

const TYPES = ['clubman', 'slingshot', 'dino'] as const;

/** Train `n` units per team out of the base doors (mixed types); record when each spawns and sets off. */
function stream(n: number, seed = 7) {
  const w = makeWorld({ seed });
  for (const team of ['player', 'enemy'] as Team[]) w.teams[team].gold = 1e6;
  const rec = new Map<number, { team: Team; type: string; spawn: number; x0: number; left: number; waitedIdle: boolean; delay: number }>();
  let queued = { player: 0, enemy: 0 };
  for (let i = 0; i < Math.round(80 / DT); i++) {
    for (const team of ['player', 'enemy'] as Team[]) {
      if (queued[team] < n && w.teams[team].queue.length < 2) {
        w.enqueueUnit(team, TYPES[queued[team] % TYPES.length]!);
        queued[team]++;
      }
    }
    w.step(DT);
    w.drainEvents(() => undefined);
    for (const u of w.units) {
      let r = rec.get(u.id);
      if (!r) rec.set(u.id, (r = { team: u.team, type: u.def.id, spawn: w.time, x0: u.x, left: -1, waitedIdle: true, delay: unitVariation(w.seed, u.id).departDelay }));
      if (r.left < 0 && u.x !== r.x0) r.left = w.time;
      if (r.left < 0 && (u.moving || (u.state !== 'waiting' && u.state !== 'attacking'))) r.waitedIdle = false;
    }
  }
  return { w, rec: [...rec.values()] };
}

describe('per-unit variation (deterministic)', () => {
  it('is derived from the seed and unit id only, within the configured limits', () => {
    const a = unitVariation(7, 12);
    assert.deepEqual(unitVariation(7, 12), a, 'same seed and id, same variation');
    assert.notDeepEqual(unitVariation(7, 13), a, 'another unit differs');
    assert.notDeepEqual(unitVariation(8, 12), a, 'another match differs');
    for (let id = 1; id < 300; id++) {
      const v = unitVariation(3, id);
      assert.ok(v.departDelay >= 0 && v.departDelay <= UNIT_VARIATION.departMax);
      assert.ok(Math.abs(v.accelScale - 1) <= UNIT_VARIATION.accel && Math.abs(v.decelScale - 1) <= UNIT_VARIATION.decel);
      assert.ok(Math.abs(v.bodyScale - 1) <= UNIT_VARIATION.bodyScale);
    }
  });

  it("does not consume the world's random stream (lane offsets and the AI's draws are unchanged)", () => {
    const w = makeWorld({ seed: 99 });
    const r = createRng(99);
    for (let i = 0; i < 6; i++) {
      const u = w.spawnUnit(i % 2 ? 'enemy' : 'player', TYPES[i % 3]!);
      assert.equal(u.z, (r() * 2 - 1) * GAME.laneHalfWidth, 'the same z draws as without variation');
    }
  });
});

describe('departure from the base door', () => {
  it('10+ units per team, all types: each waits idle for its own delay, then sets off (both teams)', () => {
    const { rec } = stream(12);
    for (const team of ['player', 'enemy'] as Team[]) {
      const mine = rec.filter((r) => r.team === team);
      assert.ok(mine.length >= 10, `${team}: ${mine.length} units`);
      assert.deepEqual(new Set(mine.map((r) => r.type)).size, 3, 'clubmen, slingshots and dinos');
      const waits = mine.map((r) => r.left - r.spawn);
      for (const [i, r] of mine.entries()) {
        assert.ok(r.left > 0, `${team} unit ${i} set off`);
        assert.ok(r.waitedIdle, `${team} unit ${i} stood idle until it left`);
        assert.ok(Math.abs(waits[i]! - r.delay) <= 2 * DT + 1e-9, `${team} unit ${i}: waited ${waits[i]!.toFixed(2)} s, delay ${r.delay.toFixed(2)} s`);
      }
      assert.ok(new Set(waits.map((t) => t.toFixed(2))).size >= mine.length - 1, 'departures not in lockstep');
      assert.ok(Math.max(...waits) - Math.min(...waits) > 0.6, `spread ${(Math.max(...waits) - Math.min(...waits)).toFixed(2)} s`);
    }
  });

  it('replays identically for a seed, differently for another', () => {
    const times = (seed: number) => stream(6, seed).rec.map((r) => `${r.type}:${r.spawn.toFixed(3)}:${r.left.toFixed(3)}`);
    assert.deepEqual(times(5), times(5));
    assert.notDeepEqual(times(5), times(6));
  });

  it('units placed directly (not from the door) set off at once, as before', () => {
    const w = makeWorld();
    const u = w.spawnUnit('player', 'clubman', -20);
    w.step(DT);
    assert.ok(u.moving && u.departIn === 0);
  });
});

describe('movement and animation variation', () => {
  it('acceleration varies between units of a type; top speed does not', () => {
    const vel = (id: number, t: number) => {
      const w = makeWorld({ seed: 4 });
      for (let i = 1; i < id; i++) w.spawnUnit('enemy', 'clubman', 30 + i * 3); // advance the id counter
      const u = w.spawnUnit('player', 'dino', -20);
      for (let i = 0; i < Math.round(t / DT); i++) w.step(DT);
      return { v: u.vel, u };
    };
    const a = vel(1, 0.3);
    const b = vel(2, 0.3);
    assert.notEqual(a.v, b.v, 'different starts');
    assert.equal(vel(1, 4).v, vel(2, 4).v, 'same cruising speed');
    assert.ok(Math.abs(a.v / b.v - a.u.accelScale / b.u.accelScale) < 1e-9);
  });

  it('a taller unit takes longer strides: same ground speed, proportionally slower cadence; the model is scaled', () => {
    const w = makeWorld();
    const u = w.spawnUnit('player', 'clubman', -20);
    u.bodyScale = 1.03;
    u.vel = u.def.speed;
    const base = gaitLoop({ ...u, bodyScale: 1 } as Unit, true, { run: u.def.speed }).speed;
    assert.ok(Math.abs(gaitLoop(u, true, { run: u.def.speed }).speed - base / 1.03) < 1e-9);
    const v = new UnitView('k', createSoldierPlaceholder(0x888888), new Map());
    v.bind(u);
    assert.ok(Math.abs((v.root.children[0] as Object3D).scale.y - 1.03) < 1e-9);
  });

  it('each unit starts its loops at its own phase (seeded by its id), also units spawned later', () => {
    const clip = new AnimationClip('walk', 1, [new NumberKeyframeTrack('Bone.position[x]', [0, 1], [0, 1])]);
    const idle = new AnimationClip('idle', 1, [new NumberKeyframeTrack('Bone.position[x]', [0, 1], [0, 1])]);
    const phase = (seed: number) => {
      const root = new Group();
      const bone = new Object3D();
      bone.name = 'Bone';
      root.add(bone);
      const a = new ModelAnimator(root, new Map([['walk', clip], ['idle', idle]]), undefined, createRng(seed));
      a.playLoop('walk');
      return a.time;
    };
    const phases = Array.from({ length: 10 }, (_, id) => phase(id * 9973 + 17)); // UnitView seeds by unit id
    assert.equal(new Set(phases.map((p) => p.toFixed(3))).size, 10, 'ten units, ten phases');
    assert.equal(phase(17), phases[0], 'reproducible');
  });
});

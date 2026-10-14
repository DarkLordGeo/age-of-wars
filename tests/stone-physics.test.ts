import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Vector3 } from 'three';
import { STONE_DEBRIS } from '../src/config/debris';
import { GAME } from '../src/config/game';
import { UNITS } from '../src/config/units';
import { StoneDebris, type GroundFn, type Stone } from '../src/render/StoneDebris';
import { rockGeometry, STONE_VARIANTS, stoneLook } from '../src/render/stoneShapes';
import { createRng } from '../src/sim/rng';
import type { SimEvent } from '../src/sim/types';
import { DT, makeWorld } from './helpers';

const flat: GroundFn = () => 0;
const SLING = UNITS.slingshot!.ranged!;
const mass = (s: Stone) => 1 / s.invMass;

/** Kinetic (linear + spin) plus potential energy of every stone. */
function energy(d: StoneDebris, g = STONE_DEBRIS.gravity): number {
  let e = 0;
  for (const s of d.stones) {
    const m = mass(s);
    const I = 0.4 * m * s.radius * s.radius;
    e += 0.5 * m * (s.vx ** 2 + s.vy ** 2 + s.vz ** 2) + 0.5 * I * (s.wx ** 2 + s.wy ** 2 + s.wz ** 2) + m * g * s.y;
  }
  return e;
}

/** Deepest overlap between any two stones (m). */
function worstOverlap(d: StoneDebris): number {
  let worst = 0;
  const st = d.stones;
  for (let i = 0; i < st.length; i++) {
    for (let j = i + 1; j < st.length; j++) {
      const a = st[i]!;
      const b = st[j]!;
      worst = Math.max(worst, a.radius + b.radius - Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z));
    }
  }
  return worst;
}

/** A pile of `n` stones dropped into a small patch and left to settle. */
function pile(n: number, seed = 1): StoneDebris {
  const d = new StoneDebris(flat);
  const r = createRng(seed);
  for (let i = 0; i < n; i++) d.drop((r() - 0.5) * 0.5, 0.1 + i * 0.05, (r() - 0.5) * 0.5, 0, 0, 0, 0.06 + r() * 0.03, 0x888888, i);
  for (let i = 0; i < Math.round(8 / DT); i++) d.step(DT);
  return d;
}

describe('stone looks: shapes, proportions, tumble', () => {
  it(`${STONE_VARIANTS} distinct irregular rock meshes, the same every time`, () => {
    const pos = Array.from({ length: STONE_VARIANTS }, (_, v) => rockGeometry(v).attributes.position!.array as Float32Array);
    for (let a = 0; a < pos.length; a++) for (let b = a + 1; b < pos.length; b++) assert.notDeepEqual(pos[a], pos[b], `variants ${a}/${b}`);
    assert.deepEqual(rockGeometry(3).attributes.position!.array, pos[3], 'deterministic');
    // Irregular: radii vary over the surface (an icosahedron's would all be 0.5).
    const radii = Array.from({ length: pos[0]!.length / 3 }, (_, i) => Math.hypot(pos[0]![3 * i]!, pos[0]![3 * i + 1]!, pos[0]![3 * i + 2]!));
    assert.ok(Math.max(...radii) - Math.min(...radii) > 0.08);
  });

  it('every stone gets its own variant, proportions, orientation and spin (seeded)', () => {
    const looks = Array.from({ length: 60 }, (_, i) => stoneLook(i + 1));
    assert.ok(new Set(looks.map((l) => l.variant)).size >= STONE_VARIANTS - 1, 'all variants in use');
    assert.equal(new Set(looks.map((l) => l.scale.toArray().map((v) => v.toFixed(3)).join())).size, 60, 'no two alike');
    assert.equal(new Set(looks.map((l) => l.spinRate.toFixed(3))).size, 60);
    assert.deepEqual(stoneLook(17), stoneLook(17), 'deterministic per stone');
  });
});

describe('shot trajectories (sim)', () => {
  /** Initial velocities and outcomes of every sling shot at a waiting target over `seconds`. */
  function volley(seed: number, killOnFire = false) {
    const w = makeWorld({ seed });
    const s = w.spawnUnit('player', 'slingshot', -6);
    s.health = 1e6;
    const target = w.spawnUnit('enemy', 'dino', -6 + SLING.range + GAME.minUnitGap - 0.5);
    target.health = 1e6;
    Object.assign(target, { def: { ...target.def, speed: 0 } });
    const fired: Array<{ vx: number; vy: number }> = [];
    const impacts: Array<Extract<SimEvent, { type: 'projectileImpact' }>> = [];
    for (let i = 0; i < Math.round(30 / DT); i++) {
      w.step(DT);
      w.drainEvents((e) => {
        if (e.type === 'projectileFired') {
          const p = w.projectiles.find((q) => q.id === e.projectileId)!;
          fired.push({ vx: p.vx, vy: p.vy });
          if (killOnFire) {
            target.x = 30; // gone from the lane the moment the stone leaves: it must miss
            Object.assign(target, { def: { ...target.def, length: 0.01, height: 0.01 } });
          }
        }
        if (e.type === 'projectileImpact') impacts.push(e);
      });
    }
    return { fired, impacts };
  }

  it('arcs vary from shot to shot, yet every aimed shot still hits', () => {
    const { fired, impacts } = volley(7);
    assert.ok(fired.length >= 15, `${fired.length} shots`);
    assert.ok(new Set(fired.map((f) => f.vy.toFixed(2))).size >= fired.length * 0.8, 'different arcs');
    const vy = fired.map((f) => f.vy);
    assert.ok(Math.max(...vy) - Math.min(...vy) > 0.5, `vy spread ${(Math.max(...vy) - Math.min(...vy)).toFixed(2)} m/s`);
    assert.ok(impacts.every((e) => e.hit), 'aim point stays inside the target');
  });

  it('is deterministic for a seed, and the stones would come down in different places', () => {
    assert.deepEqual(volley(7).fired, volley(7).fired);
    assert.notDeepEqual(volley(7).fired, volley(8).fired);
    // Where each stone would meet the ground if nothing were in its way (release at 1.45 m).
    const g = 9.8;
    const land = volley(9).fired.map((f) => f.vx * ((f.vy + Math.sqrt(f.vy * f.vy + 2 * g * 1.45)) / g));
    const mean = land.reduce((a, b) => a + b, 0) / land.length;
    const sd = Math.sqrt(land.reduce((a, b) => a + (b - mean) ** 2, 0) / land.length);
    assert.ok(sd > 0.3, `landing spread ${sd.toFixed(2)} m`);
  });
});

describe('stone-on-stone collisions', () => {
  const space = { ...STONE_DEBRIS, gravity: 0 }; // isolate the collision response

  it('a head-on hit conserves momentum, never gains energy and leaves no overlap', () => {
    const d = new StoneDebris(() => -100, space);
    const a = d.drop(0, 1, 0, 3, 0, 0, 0.08, 0x888888, 1, { w: new Vector3() });
    const b = d.drop(0.4, 1, 0, -1, 0, 0, 0.08, 0x888888, 2, { w: new Vector3() });
    const p0 = mass(a) * a.vx + mass(b) * b.vx;
    const e0 = energy(d, 0);
    for (let i = 0; i < 60; i++) d.step(DT);
    assert.ok(Math.abs(mass(a) * a.vx + mass(b) * b.vx - p0) < 1e-9 * Math.abs(p0), 'momentum');
    assert.ok(energy(d, 0) <= e0 + 1e-9, 'no energy gained');
    assert.ok(a.vx < b.vx, 'they part');
    assert.ok(worstOverlap(d) < 1e-3);
  });

  it('a heavy stone shoves a light one harder than the reverse', () => {
    const push = (heavy: boolean) => {
      const d = new StoneDebris(() => -100, space);
      d.drop(0, 1, 0, 2, 0, 0, heavy ? 0.12 : 0.06, 0x888888, 1);
      const target = d.drop(0.4, 1, 0, 0, 0, 0, heavy ? 0.06 : 0.12, 0x888888, 2);
      for (let i = 0; i < 60; i++) d.step(DT);
      return target.vx;
    };
    assert.ok(push(true) > 2 * push(false), `${push(true).toFixed(2)} vs ${push(false).toFixed(2)} m/s`);
  });

  it('a rolling stone knocks a resting one awake and moves it', () => {
    const d = new StoneDebris(flat);
    const resting = d.drop(0.4, 0, 0, 0, 0, 0, 0.08, 0x888888, 1);
    for (let i = 0; i < 60; i++) d.step(DT);
    assert.equal(resting.asleep, true);
    const x0 = resting.x;
    d.drop(0, 0.08, 0, 4, 0, 0, 0.08, 0x888888, 2, { w: new Vector3() }); // a plain roll, no seeded spin
    for (let i = 0; i < 120; i++) d.step(DT);
    assert.ok(resting.x > x0 + 0.05, `pushed ${(resting.x - x0).toFixed(3)} m`);
  });
});

describe('piles', () => {
  it('a pile settles: no overlap, nothing under the ground, all asleep, no jitter', () => {
    const d = pile(40);
    assert.ok(d.stones.every((s) => s.asleep), `${d.awake} still moving`);
    assert.ok(worstOverlap(d) < 0.005, `overlap ${worstOverlap(d).toFixed(4)} m`);
    assert.ok(d.stones.every((s) => s.y >= s.radius * (1 - STONE_DEBRIS.embed) - 1e-9));
    assert.ok(d.stones.some((s) => s.y > 2 * s.radius), 'stones rest on other stones (a real pile)');
    const before = d.stones.map((s) => [s.x, s.y, s.z].join());
    for (let i = 0; i < Math.round(5 / DT); i++) d.step(DT);
    assert.deepEqual(d.stones.map((s) => [s.x, s.y, s.z].join()), before, 'perfectly still');
  });

  it('a volley crashing into the pile at once: impulses spread, no tunnelling, no energy gain, settles again', () => {
    const d = pile(40, 3);
    const r = createRng(11);
    for (let i = 0; i < 12; i++) d.drop((r() - 0.5) * 0.6 - 1.2, 0.6 + r() * 0.3, (r() - 0.5) * 0.6, 9 + r() * 4, -4 - r() * 3, (r() - 0.5), 0.07, 0x888888, 100 + i);
    const moved = () => d.stones.filter((s) => s.seq < 40 && !s.asleep).length;
    let woke = 0;
    let prev = energy(d);
    let worst = 0;
    for (let i = 0; i < Math.round(10 / DT); i++) {
      d.step(DT);
      woke = Math.max(woke, moved());
      worst = Math.max(worst, worstOverlap(d));
      const e = energy(d);
      assert.ok(e <= prev + 1e-6 * Math.abs(prev) + 1e-6, `energy rose at t=${(i * DT).toFixed(2)}`);
      prev = e;
      for (const s of d.stones) assert.ok(s.y >= s.radius * (1 - STONE_DEBRIS.embed) - 1e-9, 'under the ground');
    }
    assert.ok(woke >= 3, `${woke} pile stones were knocked about`);
    assert.ok(worst < 0.03, `deepest transient overlap ${worst.toFixed(3)} m`);
    assert.ok(d.stones.every((s) => s.asleep), 'everything rests again');
    assert.ok(worstOverlap(d) < 0.005);
  });

  it('when a stone in the pile fades away, the ones it held settle down again', () => {
    const d = pile(30, 5);
    const low = d.stones.reduce((a, b) => (b.y < a.y ? b : a));
    const above = d.stones.filter((s) => s !== low && Math.hypot(s.x - low.x, s.z - low.z) < low.radius + s.radius && s.y > low.y);
    low.fading = 0.01;
    for (let i = 0; i < Math.round(4 / DT); i++) d.step(DT);
    assert.ok(!d.stones.includes(low));
    assert.ok(d.stones.every((s) => s.asleep));
    assert.ok(worstOverlap(d) < 0.005);
    if (above.length) assert.ok(above.some((s) => s.y < 1e3), 'stones above it are still accounted for');
  });
});

describe('performance', () => {
  it(`${STONE_DEBRIS.max} stones with a volley landing: cheap per frame, awake bodies capped`, () => {
    const d = new StoneDebris(flat);
    const r = createRng(21);
    for (let i = 0; i < STONE_DEBRIS.max - 40; i++) d.drop((r() - 0.5) * 30, 0.05, (r() - 0.5) * 6, 0, 0, 0, 0.08, 0x888888, i);
    for (let i = 0; i < 60; i++) d.step(DT);
    for (let i = 0; i < 40; i++) d.drop((r() - 0.5) * 20, 1 + r(), (r() - 0.5) * 4, 10 * (r() - 0.5), -5, r() - 0.5, 0.08, 0x888888, 1000 + i);
    const t0 = performance.now();
    let frames = 0;
    for (let i = 0; i < Math.round(3 / DT); i++, frames++) {
      d.step(DT);
      assert.ok(d.awake <= STONE_DEBRIS.maxAwake + 40, 'awake bodies bounded');
    }
    const ms = (performance.now() - t0) / frames;
    assert.ok(ms < 4, `${ms.toFixed(2)} ms per frame`);
    assert.ok(d.count <= STONE_DEBRIS.max + Math.max(8, Math.ceil(STONE_DEBRIS.max * 0.1)));
  });
});

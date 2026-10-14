import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CONTENT } from '../src/config/content';
import { STONE_DEBRIS } from '../src/config/debris';
import { GAME } from '../src/config/game';
import { UNITS } from '../src/config/units';
import { landStone, StoneDebris, type GroundFn, type Stone } from '../src/render/StoneDebris';
import type { SimEvent } from '../src/sim/types';
import { DT, makeWorld } from './helpers';

type Impact = Extract<SimEvent, { type: 'projectileImpact' }>;
const SLING = UNITS.slingshot!.ranged!;
const STONE = CONTENT.projectiles.sling_stone!;
const flat: GroundFn = () => 0;
const restY = (s: Stone, g: GroundFn) => g(s.x, s.z) + s.radius * (1 - STONE_DEBRIS.embed);

/** A sling stone that misses: its target dies while the stone is in the air. Returns the flight and its impact. */
function missedShot() {
  const w = makeWorld();
  const shooter = w.spawnUnit('player', 'slingshot', -6);
  shooter.health = 1e6;
  const target = w.spawnUnit('enemy', 'dino', -6 + SLING.range + GAME.minUnitGap - 0.5);
  target.health = 1e6;
  Object.assign(target, { def: { ...target.def, speed: 0 } });
  const samples: Array<{ x: number; y: number; vx: number; vy: number }> = [];
  let impact: Impact | null = null;
  for (let i = 0; i < Math.round(6 / DT) && !impact; i++) {
    w.step(DT);
    w.drainEvents((e) => {
      if (e.type === 'projectileFired') {
        target.health = 0; // dies the moment the stone leaves: nothing left to hit
        shooter.health = 0; // and no further shots
      }
      if (e.type === 'projectileImpact') impact = e;
    });
    const p = w.projectiles[0];
    if (p && !impact) samples.push({ x: p.x, y: p.y, vx: p.vx, vy: p.vy });
  }
  return { impact: impact as Impact | null, samples, w };
}

/** Step `debris` for `seconds`, checking it never goes under the ground. */
function settle(debris: StoneDebris, ground: GroundFn, seconds: number, each?: (t: number) => void): void {
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    debris.step(DT);
    for (const s of debris.stones) assert.ok(s.y >= restY(s, ground) - 1e-9, `stone ${s.seq} under the ground at t=${(i * DT).toFixed(2)}`);
    each?.(i * DT);
  }
}

describe('sling stones: flight and misses (sim)', () => {
  it('only the sling stone persists', () => {
    assert.deepEqual(Object.values(CONTENT.projectiles).filter((p) => p.persists).map((p) => p.id), ['sling_stone']);
  });

  it('flies a ballistic arc: horizontal momentum kept, gravity pulling it down every step', () => {
    const { samples } = missedShot();
    assert.ok(samples.length > 10);
    for (let i = 1; i < samples.length; i++) {
      const [a, b] = [samples[i - 1]!, samples[i]!];
      assert.ok(Math.abs(b.vx - a.vx) < 1e-9, 'no drag: horizontal velocity constant');
      assert.ok(Math.abs(a.vy - b.vy - STONE.gravity * DT) < 1e-9, 'vy drops by g*dt');
    }
  });

  it('a miss keeps flying, deals no damage and comes down exactly on the ground with its momentum', () => {
    const { impact, samples, w } = missedShot();
    assert.ok(impact, 'came down');
    assert.equal(impact.hit, false);
    assert.equal(impact.y, 0, 'impact point on the ground');
    const last = samples.at(-1)!;
    assert.ok(impact.x > last.x && impact.x <= last.x + last.vx * DT + 1e-9, 'where the path crosses the ground');
    assert.ok(impact.vy < -1, 'still falling');
    assert.ok(Math.abs(impact.vx - last.vx) < 1e-9, 'horizontal momentum carried into the impact');
    assert.equal(w.projectiles.length, 0, 'the sim lets go of it (debris is visual)');
  });
});

describe('stone debris (render)', () => {
  it('a missed stone lands, bounces a little, slides to rest and stays visible', () => {
    const { impact } = missedShot();
    const debris = new StoneDebris(flat);
    const s = landStone(debris, impact!, STONE, flat)!;
    assert.ok(s, 'the miss becomes debris');
    const [x0, z0] = [s.x, s.z];
    let bounces = 0;
    let lastVy = s.vy;
    let restedAt = -1;
    settle(debris, flat, 4, (t) => {
      if (lastVy <= 0 && s.vy > 0) bounces++;
      lastVy = s.vy;
      if (restedAt < 0 && s.asleep) restedAt = t;
    });
    assert.ok(bounces >= 1 && bounces <= 2, `${bounces} bounces`);
    assert.ok(restedAt > 0 && restedAt < 2.5, `at rest after ${restedAt.toFixed(2)} s`);
    const travel = Math.hypot(s.x - x0, s.z - z0);
    assert.ok(travel > 0.3 && travel < 5, `skidded ${travel.toFixed(2)} m`);
    assert.equal(debris.count, 1, 'remains on the battlefield');
    const at = [s.x, s.y, s.z, s.rot.x, s.rot.y];
    settle(debris, flat, 30);
    assert.deepEqual([s.x, s.y, s.z, s.rot.x, s.rot.y], at, 'asleep: no further motion');
  });

  it('never sinks into uneven terrain, even dropped fast onto a slope', () => {
    const hills: GroundFn = (x, z) => 0.6 * Math.sin(x * 0.7) + 0.3 * Math.cos(z * 1.3) + 0.15 * x;
    const debris = new StoneDebris(hills);
    for (let i = 0; i < 12; i++) debris.drop(i * 1.3, hills(i * 1.3, 0) + 2, 0, 25 - i * 4, -30, i - 6, 0.08, 0x888888, i);
    settle(debris, hills, 6);
    assert.ok(debris.stones.every((s) => s.asleep), 'all came to rest');
    for (const s of debris.stones) assert.ok(Math.abs(s.y - restY(s, hills)) < 1e-6, 'resting on the surface');
  });

  it('a stone that hits drops at the target instead of flying on', () => {
    const debris = new StoneDebris(flat);
    const hit: Impact = { type: 'projectileImpact', projectileId: 7, defId: 'sling_stone', hit: true, x: 3, y: 1.2, z: 0, vx: 14, vy: -2, vz: 0 };
    const s = landStone(debris, hit, STONE, flat)!;
    settle(debris, flat, 3);
    assert.ok(s.asleep && Math.abs(s.x - 3) < 0.6, `rests at x=${s.x.toFixed(2)}, by the target`);
    assert.equal(landStone(debris, { ...hit, defId: 'rock' }, CONTENT.projectiles.rock, flat), null, 'turret shots leave nothing');
  });

  it(`at most ${STONE_DEBRIS.max} stones: the oldest fade out first, the newest stay`, () => {
    const debris = new StoneDebris(flat);
    const extra = 40;
    for (let i = 0; i < STONE_DEBRIS.max + extra; i++) debris.drop(i * 0.1, 0, 0, 0, 0, 0, 0.08, 0x888888, i);
    const hard = STONE_DEBRIS.max + Math.max(8, Math.ceil(STONE_DEBRIS.max * 0.1));
    assert.ok(debris.count <= hard, `${debris.count} <= ${hard} even before fading`);
    assert.ok(debris.stones.filter((s) => s.fading !== null).every((s) => debris.scaleOf(s) <= 1));
    settle(debris, flat, STONE_DEBRIS.fade + 0.1);
    assert.equal(debris.count, STONE_DEBRIS.max);
    assert.equal(Math.min(...debris.stones.map((s) => s.seq)), extra, 'the newest are kept');
    debris.clear();
    assert.equal(debris.count, 0, 'cleared for a new match');
  });

  it(`old stones fade away after ${STONE_DEBRIS.maxAge} s`, () => {
    const debris = new StoneDebris(flat, { ...STONE_DEBRIS, maxAge: 5 });
    debris.drop(0, 0, 0, 0, 0, 0, 0.08, 0x888888, 1);
    settle(debris, flat, 5);
    assert.equal(debris.count, 1);
    settle(debris, flat, STONE_DEBRIS.fade + 0.1);
    assert.equal(debris.count, 0);
  });

  it('a long battle stays bounded: a match-length stream of stones never exceeds the cap', () => {
    const debris = new StoneDebris(flat);
    const hard = STONE_DEBRIS.max + Math.max(8, Math.ceil(STONE_DEBRIS.max * 0.1));
    let peak = 0;
    for (let i = 0; i < 2000; i++) {
      debris.drop((i % 80) - 40, 1, 0, 6, -4, 0, 0.08, 0x888888, i);
      for (let k = 0; k < 20; k++) debris.step(DT); // ~3 stones a second for 11 minutes
      peak = Math.max(peak, debris.count);
    }
    assert.ok(peak <= hard, `peak ${peak}`);
  });
});

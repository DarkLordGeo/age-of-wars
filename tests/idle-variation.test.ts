import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { AssetLibrary, type LoadedGltf } from '../src/assets/AssetLibrary';
import { createSoldierPlaceholder } from '../src/assets/placeholders';
import { IDLE_VARIATIONS } from '../src/config/idle';
import { GAME } from '../src/config/game';
import { IdleScheduler } from '../src/render/IdleScheduler';
import { ModelAnimator } from '../src/render/ModelAnimator';
import { UnitView } from '../src/render/UnitView';
import { createRng } from '../src/sim/rng';
import { DT, makeWorld } from './helpers';

(globalThis as { self?: unknown }).self ??= globalThis;
(globalThis as { createImageBitmap?: unknown }).createImageBitmap ??= async () => ({ width: 1, height: 1, close() {} });

const CFG = IDLE_VARIATIONS.clubman!;

async function library(key: string, file: string): Promise<AssetLibrary> {
  const buf = readFileSync(join(import.meta.dirname, '..', 'public', 'models', file));
  const gltf = await new GLTFLoader().parseAsync(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, '');
  const lib = new AssetLibrary();
  lib.register(key, { placeholder: createSoldierPlaceholder, expectedHeight: 1.8, strike: 0.3 });
  lib.registerLoaded(key, gltf as LoadedGltf);
  return lib;
}

/** Times (s) a scheduler fires while `idle(t)` holds, over `seconds`. */
function fires(seed: number, seconds: number, idle: (t: number) => boolean = () => true): number[] {
  const s = new IdleScheduler(CFG, createRng(seed));
  const out: number[] = [];
  for (let i = 0; i < Math.round(seconds / DT); i++) if (s.update(DT, idle(i * DT))) out.push(i * DT);
  return out;
}

describe('idle variation: when (scheduler)', () => {
  it('only the Clubman warms up (melee, Mixamo rig); the Slingshot Man and the Dino Rider do not', () => {
    assert.deepEqual(Object.keys(IDLE_VARIATIONS), ['clubman']);
    assert.equal(CFG.clip, 'warmup');
  });

  it('is deterministic per seed and never fires before minIdle or within the cooldown', () => {
    assert.deepEqual(fires(42, 600), fires(42, 600), 'same seed, same times');
    const t = fires(42, 600);
    assert.ok(t.length >= 3, `${t.length} warm-ups in 10 min`);
    assert.ok(t[0]! >= CFG.minIdle - 1e-9);
    for (let i = 1; i < t.length; i++) assert.ok(t[i]! - t[i - 1]! >= CFG.cooldown[0] - 1e-9, `gap ${(t[i]! - t[i - 1]!).toFixed(1)} s`);
  });

  it('never fires while the unit is not idle, and the idle time restarts after any interruption', () => {
    assert.deepEqual(fires(7, 300, () => false), []);
    // Idle in 3 s bursts only (shorter than minIdle): never.
    assert.deepEqual(fires(7, 300, (t) => t % 4 < 3), []);
  });

  it('identical units idling together do not warm up together', () => {
    const starts = Array.from({ length: 30 }, (_, i) => fires(1000 + i * 9973, 300));
    const first = starts.map((t) => t[0]!).filter((x) => x !== undefined);
    assert.equal(first.length, 30, 'everyone warms up eventually');
    assert.ok(new Set(first.map((x) => x.toFixed(2))).size === 30, 'all at different moments');
    // At most a few starts in any 2 s window across the whole group.
    const all = starts.flat().sort((a, b) => a - b);
    let worst = 0;
    for (let i = 0, j = 0; i < all.length; i++) {
      while (all[i]! - all[j]! > 2) j++;
      worst = Math.max(worst, i - j + 1);
    }
    // Independent random starts cluster a little by chance (~0.65 starts/s across 30 units), but
    // never as a group: had they shared a timer, all 30 would start in the same frame.
    assert.ok(worst <= 7, `${worst} of 30 units started within 2 s`);
    const mean = first.reduce((x, y) => x + y, 0) / first.length;
    const sd = Math.sqrt(first.reduce((x, y) => x + (y - mean) ** 2, 0) / first.length);
    assert.ok(sd > 8, `first warm-ups spread over time (sd ${sd.toFixed(1)} s)`);
    const perUnitPerMinute = all.length / 30 / 5;
    assert.ok(perUnitPerMinute > 0.5 && perUnitPerMinute < 2.5, `${perUnitPerMinute.toFixed(2)} warm-ups per unit per minute`);
  });
});

describe('idle variation: how (animator, real clubman.glb)', () => {
  it('clubman.glb ships the Warming Up clip on its rig', async () => {
    const lib = await library('unit.clubman', 'clubman.glb');
    const clip = lib.clipsFor('unit.clubman').get('warmup')!;
    assert.ok(clip && clip.duration > 6 && clip.duration < 6.5, `${clip?.duration} s`);
    const anim = new ModelAnimator(lib.instantiate('unit.clubman', 1), lib.clipsFor('unit.clubman'));
    assert.ok(anim.has('warmup'));
  });

  it('gives way to walking, running, attacking and death, but not to idle; never overrides an attack', async () => {
    const lib = await library('unit.clubman', 'clubman.glb');
    const make = () => new ModelAnimator(lib.instantiate('unit.clubman', 1), lib.clipsFor('unit.clubman'), lib.clipVariantsFor('unit.clubman'), () => 0.5);
    for (const next of ['walk', 'run', 'start'] as const) {
      const a = make();
      a.playLoop('idle');
      assert.ok(a.playOnce('warmup'));
      a.update(1);
      a.playLoop('idle');
      assert.equal(a.playing, 'warmup', 'an idle request does not cut it short');
      a.playLoop(next);
      assert.equal(a.playing, next, `${next} takes over at once`);
    }
    for (const next of ['attack', 'death'] as const) {
      const a = make();
      a.playLoop('idle');
      a.playOnce('warmup');
      assert.ok(a.playOnce(next));
      assert.equal(a.playing, next);
      assert.equal(a.playOnce('warmup'), false, `cannot override ${next}`);
    }
  });
});

describe('idle variation: in the game loop (UnitView, real clubman.glb)', () => {
  it('a queued Clubman warms up now and then, only while idle, and stops the moment he moves off', async () => {
    const lib = await library('unit.clubman', 'clubman.glb');
    const w = makeWorld();
    const lead = w.spawnUnit('player', 'clubman', 0);
    lead.health = 1e6;
    const foe = w.spawnUnit('enemy', 'dino', GAME.minUnitGap);
    foe.health = 1e6;
    const u = w.spawnUnit('player', 'clubman', -lead.def.length - GAME.minUnitGap - 1);
    u.health = 1e6;
    w.step(DT);
    w.drainEvents(() => undefined);
    const v = new UnitView('k', lib.instantiate('unit.clubman', 1), lib.clipsFor('unit.clubman'), {
      variants: lib.clipVariantsFor('unit.clubman'),
      locomotion: lib.locomotionFor('unit.clubman'),
    });
    v.bind(u);
    let warmups = 0;
    let last = '';
    const frame = () => {
      w.step(DT);
      w.drainEvents(() => undefined);
      v.update(DT, null);
      const p = v.animator!.playing ?? '';
      if (p === 'warmup') {
        assert.equal(u.state, 'waiting', 'only while idle out of combat');
        assert.equal(u.moving, false);
      }
      if (p === 'warmup' && last !== 'warmup') warmups++;
      last = p;
    };
    for (let i = 0; i < Math.round(150 / DT); i++) frame();
    assert.ok(warmups >= 1, `${warmups} warm-ups in 150 s of queueing`);
    // Wait until he is in the middle of one, then free the way: he must move off at once.
    for (let i = 0; i < Math.round(120 / DT) && v.animator!.playing !== 'warmup'; i++) frame();
    assert.equal(v.animator!.playing, 'warmup');
    lead.health = 0;
    foe.health = 0;
    for (let i = 0; i < 6 && !u.moving; i++) frame();
    assert.ok(u.moving);
    frame();
    assert.ok(['start', 'walk', 'run'].includes(v.animator!.playing!), `playing ${v.animator!.playing} while moving`);
  });

  it('the Slingshot Man never plays it', async () => {
    const lib = await library('unit.slingshot', 'slingshot.glb');
    const w = makeWorld();
    const s = w.spawnUnit('player', 'slingshot', -20);
    w.step(DT);
    const v = new UnitView('k', lib.instantiate('unit.slingshot', 1), lib.clipsFor('unit.slingshot'), { variants: lib.clipVariantsFor('unit.slingshot') });
    v.bind(s);
    s.moving = false;
    for (let i = 0; i < Math.round(120 / DT); i++) {
      v.update(DT, null);
      assert.notEqual(v.animator!.playing, 'warmup');
    }
  });
});

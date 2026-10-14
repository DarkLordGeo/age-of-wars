import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { AnimationMixer, Vector3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { AssetLibrary, type LoadedGltf } from '../src/assets/AssetLibrary';
import { createArcherPlaceholder } from '../src/assets/placeholders';
import { GAME } from '../src/config/game';
import { UNITS } from '../src/config/units';
import { UnitView } from '../src/render/UnitView';
import type { SimEvent } from '../src/sim/types';
import type { Unit } from '../src/sim/Unit';
import { MELEE_EXIT_MARGIN, type World } from '../src/sim/World';
import { DT, makeWorld } from './helpers';

(globalThis as { self?: unknown }).self ??= globalThis;
(globalThis as { createImageBitmap?: unknown }).createImageBitmap ??= async () => ({ width: 1, height: 1, close() {} });

const SLING = UNITS.slingshot!;
const MELEE = SLING.melee;
const KEY = 'unit.slingshot';

type Attack = Extract<SimEvent, { type: 'attack' }>;

/** Step `seconds`, collecting the slingshot's own attacks (with their time) and every event. */
function run(w: World, s: Unit, seconds: number, each?: () => void) {
  const attacks: Array<{ t: number; mode: Attack['mode'] }> = [];
  const events: SimEvent[] = [];
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    w.step(DT);
    w.drainEvents((e) => {
      events.push(e);
      if (e.type === 'attack' && e.sourceKind === 'unit' && e.sourceId === s.id) attacks.push({ t: w.time, mode: e.mode });
    });
    each?.();
  }
  return { attacks, events };
}

/** A Slingshot Man holding his ground and an enemy Clubman that walks up to him. */
function walkUp(foeHealth = 1e6) {
  const w = makeWorld();
  const s = w.spawnUnit('player', 'slingshot', -10);
  s.health = 1e6;
  const foe = w.spawnUnit('enemy', 'clubman', 6);
  foe.health = foeHealth;
  return { w, s, foe };
}

describe('Slingshot Man: fists when an enemy is too close (sim)', () => {
  it('switches to melee when the enemy reaches him: first blow after firstHit, then every interval, no shots meanwhile', () => {
    const { w, s, foe } = walkUp();
    let meleeFrom = -1;
    const { attacks, events } = run(w, s, 14, () => {
      if (meleeFrom < 0 && s.meleeTimer !== null) meleeFrom = w.time;
    });
    assert.ok(meleeFrom > 0, 'engaged hand to hand');
    assert.ok(foe.x - s.x <= MELEE.range + 1e-6, 'only once the enemy is within melee range');
    const melee = attacks.filter((a) => a.mode === 'melee');
    assert.ok(melee.length >= 4);
    assert.ok(Math.abs(melee[0]!.t - meleeFrom - MELEE.firstHit) <= DT + 1e-9, 'first blow after the wind-up, not at once');
    for (let i = 1; i < melee.length; i++) assert.ok(Math.abs(melee[i]!.t - melee[i - 1]!.t - MELEE.interval) <= DT + 1e-9, 'cooldown between blows');
    assert.equal(attacks.filter((a) => a.mode === 'ranged' && a.t > meleeFrom).length, 0, 'no sling shots while fighting hand to hand');
    assert.ok(attacks.some((a) => a.mode === 'ranged' && a.t < meleeFrom), 'he was slinging before the enemy came close');
    const hits = events.filter((e): e is Extract<SimEvent, { type: 'hit' }> => e.type === 'hit' && e.targetKind === 'unit' && e.targetId === foe.id);
    assert.equal(1e6 - foe.health, hits.reduce((a, h) => a + h.damage, 0));
    assert.ok(hits.filter((h) => h.damage === MELEE.damage).length >= melee.length - 1, `fist blows deal ${MELEE.damage}`);
  });

  it('stops punching when the target dies and goes back to the sling for the next enemy', () => {
    const { w, s, foe } = walkUp(25); // dies to the third blow (sling stones first)
    const next = w.spawnUnit('enemy', 'dino', 14);
    next.health = 1e6;
    Object.assign(next, { def: { ...next.def, speed: 0 } });
    let diedAt = -1;
    const { attacks } = run(w, s, 20, () => {
      if (diedAt < 0 && !foe.alive) diedAt = w.time;
    });
    assert.ok(diedAt > 0, 'the close enemy died');
    assert.equal(attacks.filter((a) => a.mode === 'melee' && a.t > diedAt + 1e-9).length, 0, 'no blow after the target is gone');
    assert.ok(attacks.some((a) => a.mode === 'ranged' && a.t > diedAt), 'slinging again');
    assert.equal(s.meleeTimer, null);
  });

  it(`keeps fighting until the enemy is ${MELEE_EXIT_MARGIN} m beyond reach (no flicker at the boundary)`, () => {
    const w = makeWorld();
    const s = w.spawnUnit('player', 'slingshot', 0);
    s.health = 1e6;
    const foe = w.spawnUnit('enemy', 'dino', MELEE.range);
    foe.health = 1e6;
    Object.assign(foe, { def: { ...foe.def, speed: 0 } });
    const at = (gap: number) => {
      foe.x = s.x + gap;
      run(w, s, 0.1);
      return s.meleeTimer !== null;
    };
    assert.equal(at(MELEE.range), true, 'in reach: fists');
    assert.equal(at(MELEE.range + MELEE_EXIT_MARGIN - 0.1), true, 'just beyond reach: keeps fighting');
    assert.equal(at(MELEE.range + MELEE_EXIT_MARGIN + 0.1), false, 'clearly out of reach: back to the sling');
    assert.ok(s.rangedTimer !== null, 'ranged routine running again');
    // Jitter around the melee range: one switch into melee, none back out.
    let switches = 0;
    let was = s.meleeTimer !== null;
    for (let i = 0; i < 40; i++) {
      const now = at(MELEE.range + (i % 2 ? 0.15 : -0.15));
      if (now !== was) switches++;
      was = now;
    }
    assert.ok(switches <= 1, `${switches} melee/ranged switches`);
  });

  it('never hurts allies, and stops when he dies', () => {
    const { w, s, foe } = walkUp();
    const ally = w.spawnUnit('player', 'clubman', s.x - 3);
    ally.health = ally.maxHealth;
    let killedAt = -1;
    let allyWhileAlive = ally.health;
    const { attacks } = run(w, s, 14, () => {
      if (killedAt < 0 && s.meleeTimer !== null && w.time > 8) {
        allyWhileAlive = ally.health;
        s.health = 0;
        killedAt = w.time;
      }
    });
    assert.equal(allyWhileAlive, ally.maxHealth, 'allies are never his target');
    assert.ok(foe.health < 1e6);
    assert.ok(killedAt > 0);
    assert.equal(attacks.filter((a) => a.t > killedAt + DT).length, 0, 'a dead Slingshot Man does not strike');
  });
});

async function library(withMelee = true): Promise<AssetLibrary> {
  const buf = readFileSync(join(import.meta.dirname, '..', 'public', 'models', 'slingshot.glb'));
  const gltf = (await new GLTFLoader().parseAsync(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, '')) as LoadedGltf;
  const lib = new AssetLibrary();
  lib.register(KEY, { placeholder: createArcherPlaceholder, expectedHeight: 1.8, strike: 0.53, meleeStrike: 0.45, partial: { attack: /Spine|Neck|Head|Shoulder|Arm|Hand/ } });
  lib.registerLoaded(KEY, withMelee ? gltf : { scene: gltf.scene, animations: gltf.animations.filter((a) => a.name !== 'melee') });
  return lib;
}

describe('Slingshot Man: fist-fight animation (real slingshot.glb)', () => {
  it('ships Mixamo "Fist Fight A" as an in-place `melee` clip, punching forward (+X), feet on the ground', async () => {
    const lib = await library();
    const clip = lib.clipsFor(KEY).get('melee')!;
    assert.ok(clip && Math.abs(clip.duration - 0.8) < 0.02, `${clip?.duration} s`);
    assert.equal(lib.meleeStrikeFor(KEY), 0.45);
    const m = lib.instantiate(KEY, 1);
    const mixer = new AnimationMixer(m);
    const act = mixer.clipAction(clip).play();
    const hand = m.getObjectByName('mixamorigRightHand')!;
    const hips = m.getObjectByName('mixamorigHips')!;
    const reach = (t: number) => {
      act.time = t;
      mixer.update(0);
      m.updateMatrixWorld(true);
      return hand.getWorldPosition(new Vector3()).x - hips.getWorldPosition(new Vector3()).x;
    };
    assert.ok(reach(0.45) > reach(0) + 0.15, 'the fist goes forward to the strike');
    assert.ok(reach(0.45) >= reach(0.3) && reach(0.45) >= reach(0.6), 'the strike time is the peak of the punch');
  });

  /** Drive a view of the Slingshot Man while an enemy Clubman walks up; returns what played on each damaging hit. */
  async function fight(withMelee: boolean) {
    const lib = await library(withMelee);
    const { w, s, foe } = walkUp();
    w.step(DT);
    w.drainEvents(() => undefined);
    const v = new UnitView(KEY, lib.instantiate(KEY, 1), lib.clipsFor(KEY), {
      variants: lib.clipVariantsFor(KEY),
      strike: lib.strikeTimeFor(KEY),
      meleeStrike: lib.meleeStrikeFor(KEY),
    });
    v.bind(s);
    const onHit: Array<{ clip: string | null; time: number }> = [];
    const afterHit: Array<string | null> = [];
    let since = -1;
    for (let i = 0; i < Math.round(14 / DT); i++) {
      w.step(DT);
      let melee = false;
      w.drainEvents((e) => {
        if (e.type === 'attack' && e.sourceKind === 'unit' && e.sourceId === s.id) {
          v.triggerAttack(e.mode); // exactly as GameRenderer forwards attack events
          if (e.mode === 'melee') melee = true;
        }
      });
      v.update(DT, null);
      if (melee) {
        onHit.push({ clip: v.animator!.playing, time: v.animator!.time });
        since = 0;
      } else if (since >= 0 && ++since === 10) {
        afterHit.push(v.animator!.playing); // what plays just after the blow landed
        since = -1;
      }
    }
    assert.ok(foe.health < 1e6);
    return Object.assign(onHit, { afterHit });
  }

  it('throws the punch so the fist lands on the damage tick, and follows through (not cut by the sling shot)', async () => {
    const hits = await fight(true);
    assert.ok(hits.length >= 3);
    for (const after of hits.afterHit) assert.equal(after, 'melee', 'the punch plays on after the blow lands');
    for (const h of hits) {
      assert.equal(h.clip, 'melee');
      assert.ok(Math.abs(h.time - 0.45) < 2.5 * DT + 0.05, `clip at ${h.time.toFixed(3)} s when the blow landed`);
    }
  });

  it('falls back to the shot animation when the model has no `melee` clip', async () => {
    const hits = await fight(false);
    assert.ok(hits.length >= 3);
    for (const h of hits) assert.equal(h.clip, 'attack');
  });
});

void GAME;

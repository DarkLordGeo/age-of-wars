import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { AnimationMixer, Quaternion, Vector3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { AssetLibrary, type LoadedGltf, type Locomotion } from '../src/assets/AssetLibrary';
import { createSoldierPlaceholder } from '../src/assets/placeholders';
import { handoffAt, startTimeAt } from '../src/assets/startClip';
import { GAME } from '../src/config/game';
import { physicsOf } from '../src/config/physics';
import { UnitView } from '../src/render/UnitView';
import { DT, makeWorld } from './helpers';

(globalThis as { self?: unknown }).self ??= globalThis;
(globalThis as { createImageBitmap?: unknown }).createImageBitmap ??= async () => ({ width: 1, height: 1, close() {} });

const KEY = 'unit.clubman';

const SLING_KEY = 'unit.slingshot';

async function library(key = KEY, file = 'clubman.glb', gaitSpeed = { walk: 1.5, run: 3.526 }): Promise<AssetLibrary> {
  const buf = readFileSync(join(import.meta.dirname, '..', 'public', 'models', file));
  const gltf = await new GLTFLoader().parseAsync(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, '');
  const lib = new AssetLibrary();
  lib.register(key, { placeholder: createSoldierPlaceholder, expectedHeight: 1.8, strike: 0.3, gaitSpeed });
  lib.registerLoaded(key, gltf as LoadedGltf);
  return lib;
}

function median(v: number[]): number {
  const a = [...v].sort((x, y) => x - y);
  return a.length ? a[Math.floor(a.length / 2)]! : 0;
}

interface Trace {
  clips: Array<{ clip: string; at: number; vel: number }>;
  /** Last clip time of the start clip before it handed over (null: never played). */
  startEnd: number | null;
  /** Planted-foot slip (m/s, mean) and ground speed per clip while moving. */
  slip: Record<string, { slip: number; speed: number; seconds: number }>;
}

/**
 * A Clubman sets off toward a waiting Dino Rider `room` metres away (the sim picks the gait),
 * drawn by a real UnitView with the real clubman.glb, like the game loop. Records which clip
 * drives the model and how far the planted foot slides on the ground (the slower of ankle and
 * ball of the foot, of the lower foot, while it is within 4 cm of that clip's lowest step).
 */
function setOff(lib: AssetLibrary, room: number, locomotion: Locomotion, seconds = 5, at = 0, who = { key: KEY, unit: 'clubman', queue: 1 }): Trace {
  const w = makeWorld();
  // A halted queue of `who.queue` Clubmen (fighting a Dino Rider further on), `room` metres ahead.
  w.spawnUnit('enemy', 'dino', at + GAME.minUnitGap).health = 1e6;
  let lead = w.spawnUnit('player', 'clubman', at);
  lead.health = 1e6;
  for (let i = 1; i < who.queue; i++) {
    lead = w.spawnUnit('player', 'clubman', lead.x - lead.def.length - GAME.minUnitGap);
    lead.health = 1e6;
  }
  const u = w.spawnUnit('player', who.unit, lead.x - lead.def.length - GAME.minUnitGap - room);
  u.health = 1e6;
  w.step(DT); // the renderer binds views after the step that spawned the unit
  w.drainEvents(() => undefined);
  const v = new UnitView(who.key, lib.instantiate(who.key, 1), lib.clipsFor(who.key), { variants: lib.clipVariantsFor(who.key), locomotion });
  v.bind(u);
  const model = v.root.children[0]!;
  const joints = ['Left', 'Right'].map((s) => [`mixamorig${s}Foot`, `mixamorig${s}ToeBase`].map((n) => v.root.getObjectByName(n)!));
  // Everything in the model's own frame (x forward, y up): terrain slope and path turns drop out.
  const rec: Array<{ clip: string; j: Vector3[][]; root: Vector3; moving: boolean; dx: number }> = [];
  const clips: Trace['clips'] = [];
  let startEnd: number | null = null;
  const prevRoot = new Vector3();
  const q = new Quaternion();
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    const x0 = u.x;
    w.step(DT);
    w.drainEvents(() => undefined);
    prevRoot.copy(v.root.position);
    v.update(DT, null);
    v.root.updateMatrixWorld(true);
    const clip = v.animator!.playing ?? '-';
    if (clips.at(-1)?.clip !== clip) clips.push({ clip, at: i * DT, vel: u.vel });
    if (clip === 'start') startEnd = v.animator!.time;
    model.getWorldQuaternion(q).invert();
    rec.push({
      clip,
      j: joints.map((js) => js.map((o) => model.worldToLocal(o.getWorldPosition(new Vector3())))),
      root: v.root.position.clone().sub(prevRoot).applyQuaternion(q), // root motion this frame, model frame
      moving: u.moving,
      dx: Math.abs(u.x - x0),
    });
  }
  const floor: Record<string, number> = {};
  for (const r of rec) if (r.moving) floor[r.clip] = Math.min(floor[r.clip] ?? Infinity, ...r.j.map((js) => js[0]!.y));
  const acc: Record<string, { d: number; t: number; travel: number; all: number[] }> = {};
  for (let i = 1; i < rec.length; i++) {
    const r = rec[i]!;
    const p = rec[i - 1]!;
    if (!r.moving || r.clip !== p.clip) continue;
    const f = r.j[0]![0]!.y < r.j[1]![0]!.y ? 0 : 1;
    if (r.j[f]![0]!.y > floor[r.clip]! + 0.04 || p.j[f]![0]!.y > floor[r.clip]! + 0.04) continue;
    // Forward ground slip of the planted joint (ankle or ball, whichever is stiller): its motion in
    // the model frame plus the model's own motion.
    const slipOf = (k: number) => r.j[f]![k]!.x - p.j[f]![k]!.x + r.root.x;
    const k = Math.abs(slipOf(0)) < Math.abs(slipOf(1)) ? 0 : 1;
    const s = (acc[r.clip] ??= { d: 0, t: 0, travel: 0, all: [] });
    s.all.push(slipOf(k) / DT);
    s.d += slipOf(k);
    s.t += DT;
    s.travel += r.dx;
  }
  const slip: Trace['slip'] = {};
  for (const [k, s] of Object.entries(acc)) slip[k] = { slip: median(s.all), speed: s.travel / s.t, seconds: s.t };
  return { clips, slip, startEnd };
}

describe('Start Walking -> Walking (Clubman)', () => {
  it('the start clip is prepared in place, with a monotone travel curve that keeps planted feet still', async () => {
    const lib = await library();
    const start = lib.locomotionFor(KEY).start!;
    assert.ok(start, 'clubman.glb ships a start clip');
    const hips = start.clip.tracks.find((t) => t.name === 'mixamorigHips.position')!;
    const fwd = [0, 1, 2].map((a) => Math.abs(hips.values[hips.values.length - 3 + a]! - hips.values[a]!));
    // (armature units: cm) the forward axis is held exactly; sway and bob stay, the 1.3 m travel is gone
    assert.ok(Math.min(...fwd) < 1e-6, 'forward axis held');
    assert.ok(Math.max(...fwd) < 20, `net hips change ${fwd.map((d) => d.toFixed(1)).join('/')} cm`);
    for (let i = 1; i < start.travel.length; i++) assert.ok(start.travel[i]! >= start.travel[i - 1]!);
    assert.ok(start.travel.at(-1)! > 1 && start.travel.at(-1)! < 1.6, `travel ${start.travel.at(-1)} m`);
    assert.ok(Math.abs(startTimeAt(start, start.travel[30]!) - start.times[30]!) < 1e-6, 'distance -> time inverts the curve');
    // Pose the in-place clip: the foot on the ground, plus the travel so far, stays put.
    const m = lib.instantiate(KEY, 1);
    const mixer = new AnimationMixer(m);
    const action = mixer.clipAction(start.clip).play();
    const toe = m.getObjectByName('mixamorigRightToeBase')!;
    const planted: number[] = [];
    for (let i = 0; i < start.times.length; i++) {
      action.time = start.times[i]!;
      mixer.update(0);
      m.updateMatrixWorld(true);
      const p = toe.getWorldPosition(new Vector3());
      if (p.y < 0.03 && start.times[i]! > 0.8 && start.times[i]! < 1.6) planted.push(p.x + start.travel[i]!);
    }
    assert.ok(planted.length > 10);
    assert.ok(Math.max(...planted) - Math.min(...planted) < 0.02, `planted toe moves ${(Math.max(...planted) - Math.min(...planted)).toFixed(3)} m`);
  });

  it('hands over to the walk where the leg poses match (same foot forward)', async () => {
    const start = (await library()).locomotionFor(KEY).start!;
    const h = handoffAt(start, 'walk', start.exit)!;
    assert.ok(start.exit > start.clip.duration * 0.4 && start.exit < start.clip.duration);
    assert.ok(h.error < 1.2, `pose error at the hand-over ${h.error.toFixed(2)} rad over the legs`);
  });

  it('plays Start Walking up to its hand-over point wherever the queue is on the winding path', async () => {
    const lib = await library();
    const exit = lib.locomotionFor(KEY).start!.exit;
    for (const at of [-20, -10, -2, 0, 6, 14]) {
      const t = setOff(lib, 2.2, lib.locomotionFor(KEY), 3, at);
      assert.equal(t.clips[0]!.clip, 'start', `at ${at}`);
      assert.ok(t.startEnd! > exit - 0.1, `at x=${at}: handed over at clip time ${t.startEnd!.toFixed(2)} s (exit ${exit.toFixed(2)})`);
    }
  });

  it('setting off into a walk: Start Walking, then Walking, then idle; feet do not slide', async () => {
    const lib = await library();
    const t = setOff(lib, 2.2, lib.locomotionFor(KEY));
    assert.deepEqual(t.clips.map((c) => c.clip), ['start', 'walk', 'idle']);
    const handover = t.clips[1]!;
    assert.ok(handover.vel > 0.5 && handover.vel <= physicsOf('clubman').walk!.speed + 1e-9);
    assert.ok(Math.abs(t.slip.start!.slip) < 0.05, `start slip ${t.slip.start!.slip.toFixed(3)} m/s`);
    assert.ok(Math.abs(t.slip.walk!.slip) < 0.05, `walk slip ${t.slip.walk!.slip.toFixed(3)} m/s`);
  });

  it('running and walking loops match the ground speed on the winding path', async () => {
    const lib = await library();
    const run = setOff(lib, 30, lib.locomotionFor(KEY));
    assert.deepEqual(run.clips.map((c) => c.clip), ['run']);
    assert.ok(Math.abs(run.slip.run!.slip) < 0.15, `run slip ${run.slip.run!.slip.toFixed(3)} m/s at ${run.slip.run!.speed.toFixed(2)} m/s`);
    const walk = setOff(lib, 3.9, lib.locomotionFor(KEY)); // runs, then walks the last metres
    assert.deepEqual(walk.clips.map((c) => c.clip), ['run', 'walk', 'idle']);
    assert.ok(Math.abs(walk.slip.walk!.slip) < 0.05, `walk slip ${walk.slip.walk!.slip.toFixed(3)} m/s`);
  });

  it('Slingshot Man (same rig): Start Walking into a queue, then holds; run and walk without sliding', async () => {
    const lib = await library(SLING_KEY, 'slingshot.glb', { walk: 1.5, run: 3.598 });
    const loco = lib.locomotionFor(SLING_KEY);
    assert.ok(loco.start, 'slingshot.glb ships Start Walking');
    const who = { key: SLING_KEY, unit: 'slingshot', queue: 4 }; // queue long enough to be out of range
    const q = setOff(lib, 2.2, loco, 4, 0, who);
    assert.deepEqual(q.clips.map((c) => c.clip), ['start', 'walk', 'idle']);
    assert.ok(q.startEnd! > loco.start!.exit - 0.1);
    assert.ok(Math.abs(q.slip.start!.slip) < 0.05, `start slip ${q.slip.start!.slip.toFixed(3)}`);
    const far = setOff(lib, 26, loco, 12, 0, who); // runs, then walks up to the queue
    assert.deepEqual(far.clips.map((c) => c.clip), ['run', 'walk', 'idle']);
    assert.ok(Math.abs(far.slip.run!.slip) < 0.15, `run slip ${far.slip.run!.slip.toFixed(3)} at ${far.slip.run!.speed.toFixed(2)} m/s`);
    assert.ok(Math.abs(far.slip.walk!.slip) < 0.05, `walk slip ${far.slip.walk!.slip.toFixed(3)}`);
  });

  it('the sim sets off into a walk at the walking gait acceleration', () => {
    const w = makeWorld();
    const lead = w.spawnUnit('player', 'clubman', 0);
    lead.health = 1e6;
    w.spawnUnit('enemy', 'dino', GAME.minUnitGap).health = 1e6;
    const u = w.spawnUnit('player', 'clubman', -lead.def.length - GAME.minUnitGap - 2.2);
    for (let i = 0; i < 30; i++) w.step(DT);
    assert.equal(u.gait, 'walk');
    assert.ok(Math.abs(u.vel - 30 * DT * physicsOf('clubman').walk!.accel) < 1e-9, `vel ${u.vel}`);
  });
});

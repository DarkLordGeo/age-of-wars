import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { AnimationClip, Group, NumberKeyframeTrack, Object3D, QuaternionKeyframeTrack } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { ClipName } from '../src/assets/contract';
import { GAME } from '../src/config/game';
import { physicsOf } from '../src/config/physics';
import { UNITS } from '../src/config/units';
import { ModelAnimator } from '../src/render/ModelAnimator';
import { GAIT_SPEED, gaitLoop } from '../src/render/UnitView';
import type { Unit } from '../src/sim/Unit';
import { nextGait, type World } from '../src/sim/World';
import { DT, EventLog, makeWorld } from './helpers';

(globalThis as { self?: unknown }).self ??= globalThis;
(globalThis as { createImageBitmap?: unknown }).createImageBitmap ??= async () => ({ width: 1, height: 1, close() {} });

const WALK = physicsOf('clubman').walk!;
const RUN = UNITS.clubman!.speed;

/** Free room ahead of a player unit (same rule as World.updateUnit). */
function roomOf(w: World, u: Unit): number {
  const ahead = w.alive[u.team][u.laneIndex + 1];
  if (ahead) return ahead.x - u.x - ahead.def.length - GAME.minUnitGap;
  const front = w.alive.enemy[0];
  return front ? front.x - u.x - GAME.minUnitGap : w.bases.enemy.x - u.x;
}

/** Step `seconds`, calling `each` after every step. */
function step(w: World, seconds: number, each?: () => void, log?: EventLog): void {
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    w.step(DT);
    w.drainEvents(log ? log.sink : () => undefined);
    each?.();
  }
}

/** Gait switches of a unit while stepping (time of each switch). */
function track(w: World, u: Unit, seconds: number, log?: EventLog): Array<{ t: number; gait: string; room: number }> {
  const out: Array<{ t: number; gait: string; room: number }> = [];
  let last = u.gait;
  step(w, seconds, () => {
    if (u.gait !== last) out.push({ t: w.time, gait: u.gait, room: roomOf(w, u) });
    last = u.gait;
  }, log);
  return out;
}

describe('locomotion gaits (sim)', () => {
  it('runs over distance at full speed', () => {
    const w = makeWorld();
    const u = w.spawnUnit('player', 'clubman', -30);
    w.spawnUnit('enemy', 'clubman', 30).health = 1e6;
    step(w, 1);
    assert.equal(u.gait, 'run');
    assert.ok(Math.abs(u.vel - RUN) < 1e-9, `vel ${u.vel}`);
  });

  it('drops to a walk for the last metres to the enemy, once, and walks at walking speed', () => {
    const w = makeWorld();
    const u = w.spawnUnit('player', 'clubman', -12);
    u.health = 1e6;
    const foe = w.spawnUnit('enemy', 'dino', 0); // waits: give it no reason to move
    foe.health = 1e6;
    let maxWalkVel = 0;
    let closeRunVel = 0;
    const switches = track(w, u, 8);
    // Replay with a fresh world to sample speeds while walking.
    const w2 = makeWorld();
    const u2 = w2.spawnUnit('player', 'clubman', -12);
    u2.health = 1e6;
    w2.spawnUnit('enemy', 'dino', 0).health = 1e6;
    step(w2, 8, () => {
      if (u2.gait === 'walk' && u2.gaitFor > 0.5) maxWalkVel = Math.max(maxWalkVel, u2.vel);
      if (u2.gait === 'run' && roomOf(w2, u2) < WALK.enter - 0.5) closeRunVel = Math.max(closeRunVel, u2.vel);
    });
    assert.deepEqual(switches.map((s) => s.gait), ['walk'], 'one switch to walking, no flicker');
    assert.ok(switches[0]!.room < WALK.enter && switches[0]!.room > WALK.enter - 0.5, `switched at ${switches[0]!.room.toFixed(2)} m`);
    assert.ok(maxWalkVel <= WALK.speed + 1e-9, `walk speed ${maxWalkVel}`);
    assert.equal(closeRunVel, 0, 'never runs inside the walking distance');
    assert.equal(u.state, 'attacking', 'still reaches melee range');
  });

  it('queues at a walk behind a halted ally, keeping the gap', () => {
    const w = makeWorld();
    const lead = w.spawnUnit('player', 'clubman', -2);
    const back = w.spawnUnit('player', 'clubman', -16);
    w.spawnUnit('enemy', 'dino', 0).health = 1e6;
    lead.health = back.health = 1e6;
    let ranClose = false;
    step(w, 10, () => {
      if (back.gait === 'run' && roomOf(w, back) < WALK.enter - 0.5) ranClose = true;
      assert.ok(back.x <= lead.x - lead.def.length - GAME.minUnitGap + 1e-6, 'keeps the gap');
    });
    assert.equal(lead.moving, false, 'the leader fights in place');
    assert.equal(back.gait, 'walk');
    assert.equal(back.moving, false, 'in its queue spot');
    assert.equal(ranClose, false);
  });

  it('a column following a running ally keeps running (no walk/run cycling behind it)', () => {
    const w = makeWorld();
    const lead = w.spawnUnit('player', 'clubman', -30);
    const back = w.spawnUnit('player', 'clubman', -30 - lead.def.length - GAME.minUnitGap - 0.3);
    w.spawnUnit('enemy', 'clubman', 38).health = 1e6;
    const switches = track(w, back, 6);
    assert.deepEqual(switches, []);
    assert.equal(back.gait, 'run');
    assert.ok(Math.abs(back.vel - RUN) < 1e-6);
  });

  it('never switches gait faster than the hold time, in a busy fight', () => {
    const w = makeWorld();
    const units: Unit[] = [];
    for (let i = 0; i < 5; i++) units.push(w.spawnUnit('player', 'clubman', -20 - i * 2.5));
    for (let i = 0; i < 5; i++) units.push(w.spawnUnit('enemy', i % 2 ? 'dino' : 'clubman', 20 + i * 3));
    const last = new Map<number, { gait: string; t: number }>();
    step(w, 40, () => {
      for (const u of units) {
        const prev = last.get(u.id);
        if (prev && prev.gait !== u.gait) {
          assert.ok(w.time - prev.t >= WALK.hold - 1e-9, `unit ${u.id} switched after ${(w.time - prev.t).toFixed(2)} s`);
          last.set(u.id, { gait: u.gait, t: w.time });
        } else if (!prev) last.set(u.id, { gait: u.gait, t: -Infinity });
      }
    });
  });

  it('hysteresis: a room signal jittering around the threshold switches gait once, not every step', () => {
    let gait: 'run' | 'walk' = 'run';
    let gaitFor = Infinity;
    let switches = 0;
    for (let i = 0; i < 600; i++) {
      const room = WALK.enter + (i % 2 ? 0.05 : -0.05) + 0.2 * Math.sin(i / 7); // noisy, hovering at `enter`
      gaitFor += DT;
      const next = nextGait(gait, gaitFor, room, false, WALK);
      if (next !== gait) {
        switches++;
        gait = next;
        gaitFor = 0;
      }
    }
    assert.equal(switches, 1, 'walks once and stays walking until the room exceeds exit');
    assert.equal(nextGait('walk', 1, WALK.exit + 0.01, false, WALK), 'run');
    assert.equal(nextGait('walk', 1, WALK.exit - 0.01, false, WALK), 'walk');
    assert.equal(nextGait('walk', 1, 0.5, true, WALK), 'run', 'the ally ahead runs off');
    assert.equal(nextGait('run', 1, 0.5, true, WALK), 'run', 'following a running ally');
    assert.equal(nextGait('walk', WALK.hold / 2, WALK.exit + 5, false, WALK), 'walk', 'minimum time in a gait');
  });

  it('only melee units with a walking gait walk; the Slingshot Man and the Dino Rider always run', () => {
    assert.equal(physicsOf('slingshot').walk, undefined);
    assert.equal(physicsOf('dino').walk, undefined);
    const w = makeWorld();
    const s = w.spawnUnit('player', 'slingshot', -10);
    const d = w.spawnUnit('player', 'dino', -1);
    w.spawnUnit('enemy', 'clubman', 2).health = 1e6;
    step(w, 6, () => {
      assert.equal(s.gait, 'run');
      assert.equal(d.gait, 'run');
    });
  });

  it('melee timing is unchanged once engaged: first hit after firstHit, then every interval', () => {
    const w = makeWorld();
    const u = w.spawnUnit('player', 'clubman', -8);
    u.health = 1e6;
    w.spawnUnit('enemy', 'dino', 0).health = 1e6;
    let engagedAt = -1;
    const hits: number[] = [];
    const log = new EventLog();
    step(w, 12, () => {
      if (engagedAt < 0 && u.meleeTimer !== null) engagedAt = w.time;
      for (const e of log.all.splice(0)) if (e.type === 'attack' && e.sourceId === u.id) hits.push(w.time);
    }, log);
    const def = UNITS.clubman!.melee;
    assert.ok(hits.length >= 3);
    assert.ok(Math.abs(hits[0]! - engagedAt - def.firstHit) <= DT + 1e-9, `first hit ${hits[0]! - engagedAt}`);
    for (let i = 1; i < hits.length; i++) assert.ok(Math.abs(hits[i]! - hits[i - 1]! - def.interval) <= DT + 1e-9);
  });
});

describe('locomotion clips (render)', () => {
  const unit = (p: Partial<Unit>): Unit => ({ def: UNITS.clubman!, moving: true, vel: RUN, gait: 'run', ...p }) as Unit;

  it('picks idle, run or walk from the sim gait, with stride speed matched to ground speed', () => {
    assert.deepEqual(gaitLoop(unit({ moving: false }), true), { clip: 'idle', speed: 1 });
    assert.deepEqual(gaitLoop(unit({}), true), { clip: 'run', speed: 1 });
    assert.deepEqual(gaitLoop(unit({ gait: 'walk', vel: WALK.speed }), true), { clip: 'walk', speed: 1 });
    // Without a `run` clip, `walk` is the model's only locomotion loop (authored at run speed).
    assert.deepEqual(gaitLoop(unit({}), false), { clip: 'walk', speed: 1 });
    assert.equal(gaitLoop(unit({ vel: RUN / 2 }), true).speed, 0.5, 'accelerating: slower stride, no sliding');
    assert.equal(gaitLoop(unit({ vel: 0.01 }), true).speed, GAIT_SPEED.min);
  });

  /** A one-bone rig with idle/walk/run loops of different lengths. */
  function rig(): { root: Object3D; anim: ModelAnimator; calls: () => number } {
    const root = new Group();
    const bone = new Object3D();
    bone.name = 'Bone';
    root.add(bone);
    const loop = (name: ClipName, d: number) =>
      new AnimationClip(name, d, [new NumberKeyframeTrack('Bone.position[x]', [0, d], [0, 1]), new QuaternionKeyframeTrack('Bone.quaternion', [0, d], [0, 0, 0, 1, 0, 0, 0, 1])]);
    const clips = new Map<ClipName, AnimationClip>([['idle', loop('idle', 2)], ['walk', loop('walk', 1.2)], ['run', loop('run', 0.6)]]);
    let n = 0;
    const anim = new ModelAnimator(root, clips, undefined, () => (n++, 0.25));
    return { root, anim, calls: () => n };
  }

  it('walk <-> run keeps the stride phase; idle/walk switches do not re-randomize the phase', () => {
    const { anim, calls } = rig();
    anim.playLoop('run');
    assert.ok(Math.abs(anim.time - 0.25 * 0.6) < 1e-9, 'first loop starts at the unit phase');
    anim.update(0.3); // half a run cycle later
    const frac = anim.time / 0.6;
    anim.playLoop('walk');
    assert.ok(Math.abs(anim.time / 1.2 - frac) < 1e-9, 'walk picks up the run at the same point of the stride');
    anim.update(0.5);
    anim.playLoop('idle');
    anim.playLoop('walk');
    assert.ok(Math.abs(anim.time - 0.25 * 1.2) < 1e-9);
    assert.equal(calls(), 1, 'one random draw per unit, at the first loop');
  });

  it('setLoopSpeed scales the loop playback without restarting it', () => {
    const { anim } = rig();
    anim.playLoop('run');
    const t0 = anim.time;
    anim.setLoopSpeed(0.5);
    anim.update(0.2);
    assert.ok(Math.abs(anim.time - (t0 + 0.1)) < 1e-9, `time ${anim.time}`);
    anim.playLoop('walk');
    const t1 = anim.time;
    anim.update(0.2);
    assert.ok(Math.abs(anim.time - (t1 + 0.1)) < 1e-9, 'the next loop keeps the speed factor');
  });
});

describe('locomotion loops in the shipped models', () => {
  const FPS = 30;
  for (const file of ['clubman.glb', 'slingshot.glb']) {
    it(`${file}: every loop lasts whole frames and ends on its first pose (no pop or hitch at the wrap)`, async () => {
      const buf = readFileSync(join(import.meta.dirname, '..', 'public', 'models', file));
      const gltf = await new GLTFLoader().parseAsync(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, '');
      const loops = gltf.animations.filter((c) => ['idle', 'walk', 'run'].includes(c.name));
      assert.ok(loops.length >= 2);
      for (const clip of loops) {
        const frames = clip.duration * FPS;
        assert.ok(Math.abs(frames - Math.round(frames)) < 1e-3, `${clip.name}: ${frames.toFixed(2)} frames`);
        for (const t of clip.tracks) {
          const n = t.getValueSize();
          const v = t.values;
          const last = v.length - n;
          assert.ok(Math.abs(t.times[t.times.length - 1]! - clip.duration) < 1e-4, `${clip.name} ${t.name} ends early`);
          if (n === 4) {
            const dot = Math.abs(v[0]! * v[last]! + v[1]! * v[last + 1]! + v[2]! * v[last + 2]! + v[3]! * v[last + 3]!);
            const angle = 2 * Math.acos(Math.min(1, dot));
            assert.ok(angle < 0.01, `${clip.name} ${t.name}: ${angle.toFixed(3)} rad jump at the wrap`);
          } else {
            for (let i = 0; i < n; i++) assert.ok(Math.abs(v[i]! - v[last + i]!) < 0.05, `${clip.name} ${t.name}[${i}] jumps ${(v[last + i]! - v[i]!).toFixed(3)}`);
          }
        }
      }
    });
  }
});

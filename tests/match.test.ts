import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { GAME } from '../src/config/game';
import { EventLog, DT, makeWorld, run, runUntil } from './helpers';

describe('victory and defeat', () => {
  it('destroying the enemy base is a victory and ends gameplay', () => {
    const w = makeWorld();
    const log = new EventLog();
    w.bases.enemy.health = 20;
    w.spawnUnit('player', 'clubman').health = 1e6; // survive the turret

    assert.ok(runUntil(w, () => w.status !== 'playing', 40, log) >= 0);
    assert.equal(w.status, 'victory');
    assert.equal(log.count('victory'), 1);
    assert.equal(log.count('defeat'), 0);
    run(w, 1, log);
    assert.equal(log.count('victory'), 1, 'emitted once');
    assert.equal(w.enqueueUnit('player', 'clubman'), 'game-over');
    assert.equal(w.purchaseUpgrade('player', 'trade_routes'), 'game-over');
    const t = w.time;
    run(w, 1);
    assert.equal(w.time, t, 'simulation is frozen');
  });

  it('losing the player base is a defeat', () => {
    const w = makeWorld();
    const log = new EventLog();
    w.bases.player.health = 20;
    w.spawnUnit('enemy', 'clubman').health = 1e6;

    assert.ok(runUntil(w, () => w.status !== 'playing', 40, log) >= 0);
    assert.equal(w.status, 'defeat');
    assert.equal(log.count('defeat'), 1);
    assert.equal(log.count('victory'), 0);
  });

  it('emits baseDamage events that track base health', () => {
    const w = makeWorld();
    const log = new EventLog();
    w.spawnUnit('player', 'clubman').health = 1e6;
    run(w, 25, log);
    const events = log.of('baseDamage').filter((e) => e.team === 'enemy');
    assert.ok(events.length > 0);
    assert.equal(events[events.length - 1]!.health, w.bases.enemy.health);
  });
});

describe('event hooks', () => {
  it('a full engagement produces every hook type', () => {
    const w = makeWorld();
    const log = new EventLog();
    w.teams.player.xp = 100;
    w.teams.player.gold = 500;
    w.enqueueUnit('player', 'slingshot');
    w.enqueueUnit('player', 'clubman');
    w.spawnUnit('enemy', 'clubman').health = 30;
    w.bases.enemy.health = 15;
    run(w, 60, log);
    for (const type of ['spawn', 'attack', 'projectileFired', 'projectileImpact', 'hit', 'death', 'baseDamage', 'victory'] as const) {
      assert.ok(log.count(type) > 0, `missing ${type}`);
    }
  });
});

describe('long-running battles', () => {
  it('a 15 minute AI match stays stable and bounded', () => {
    const w = makeWorld({ ai: true, difficulty: 'hard' });
    let maxUnits = 0;
    let maxProjectiles = 0;
    for (let i = 0; i < (15 * 60) / DT; i++) {
      // Scripted player: keep training the best unit it can.
      if (i % 90 === 0) for (const id of ['dino', 'slingshot', 'clubman']) if (w.enqueueUnit('player', id) === 'ok') break;
      if (i % 600 === 0) w.purchaseUpgrade('player', 'sharpened_weapons');
      w.step(DT);
      w.drainEvents(() => undefined);
      maxUnits = Math.max(maxUnits, w.units.length);
      maxProjectiles = Math.max(maxProjectiles, w.projectiles.length);
      if (w.status !== 'playing') break;
    }
    for (const u of w.units) {
      assert.ok(Number.isFinite(u.x) && Number.isFinite(u.health));
      assert.ok(Math.abs(u.x) < GAME.baseOffset + 10, `unit escaped the map: ${u.x}`);
    }
    assert.ok(Number.isFinite(w.teams.player.gold) && Number.isFinite(w.teams.enemy.gold));
    console.log(`  15min match: status=${w.status} t=${w.time.toFixed(0)}s maxUnits=${maxUnits} maxProjectiles=${maxProjectiles}`);
    assert.ok(maxUnits < 400, `unit count exploded: ${maxUnits}`);
    assert.ok(maxProjectiles < 200, `projectiles leaked: ${maxProjectiles}`);
  });

  it('alive lists stay sorted and consistent with unit state', () => {
    const w = makeWorld({ ai: true });
    for (let i = 0; i < 120 / DT; i++) {
      if (i % 120 === 0) w.enqueueUnit('player', 'clubman');
      w.step(DT);
      w.drainEvents(() => undefined);
      for (const team of ['player', 'enemy'] as const) {
        const list = w.alive[team];
        for (let j = 0; j < list.length; j++) {
          assert.ok(list[j]!.alive && list[j]!.team === team);
          assert.equal(list[j]!.laneIndex, j);
          if (j > 0) assert.ok(list[j - 1]!.x <= list[j]!.x + 1e-9);
        }
      }
    }
  });

  it('handles a thousand units without blowing up', () => {
    const w = makeWorld();
    for (let i = 0; i < 500; i++) {
      w.spawnUnit('player', i % 3 === 0 ? 'slingshot' : 'clubman');
      w.spawnUnit('enemy', i % 3 === 0 ? 'slingshot' : 'dino');
    }
    const t0 = performance.now();
    run(w, 10);
    const ms = performance.now() - t0;
    assert.ok(w.units.every((u) => Number.isFinite(u.x)));
    assert.ok(ms < 20000, `600 ticks with 1000 units took ${ms.toFixed(0)}ms`);
    console.log(`  perf: 600 ticks @ 1000 units = ${ms.toFixed(0)}ms (${(ms / 600).toFixed(2)}ms/tick)`);
  });
});

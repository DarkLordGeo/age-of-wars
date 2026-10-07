import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { GAME } from '../src/config/game';
import { TURRETS } from '../src/config/turrets';
import { EventLog, makeWorld, run } from './helpers';

const tower = TURRETS.watchtower!;
const playerTurretX = -GAME.baseOffset + GAME.turretMounts[0]!.forward;

describe('base turrets', () => {
  it('each base starts with a turret from the current age', () => {
    const w = makeWorld();
    assert.equal(w.bases.player.turrets.length, GAME.turretMounts.length);
    assert.equal(w.bases.enemy.turrets[0]!.def.id, 'watchtower');
  });

  it('acquires an enemy in range and fires a projectile that damages it', () => {
    const w = makeWorld();
    const log = new EventLog();
    const e = w.spawnUnit('enemy', 'brute');
    e.x = playerTurretX + 10;
    e.health = 1e6;
    run(w, 0.05, log);
    const atk = log.of('attack').find((a) => a.sourceKind === 'turret');
    assert.ok(atk, 'turret attacks');
    assert.equal(atk.team, 'player');
    assert.equal(log.of('projectileFired')[0]!.defId, 'bolt');
    assert.equal(log.count('hit'), 0, 'no instant damage');
    run(w, 1, log);
    const hits = log.of('hit').filter((h) => h.targetKind === 'unit');
    assert.ok(hits.length >= 1);
    assert.equal(hits[0]!.damage, tower.attack.damage);
    assert.ok(e.health < 1e6);
  });

  it('ignores targets outside its range', () => {
    const w = makeWorld();
    const log = new EventLog();
    const e = w.spawnUnit('enemy', 'brute');
    e.x = playerTurretX + tower.attack.range + 5;
    e.health = 1e6;
    run(w, 0.1, log);
    assert.equal(log.of('attack').filter((a) => a.sourceKind === 'turret').length, 0);
  });

  it('respects its cooldown', () => {
    const w = makeWorld();
    const log = new EventLog();
    const e = w.spawnUnit('enemy', 'brute');
    e.x = playerTurretX + 12;
    e.health = 1e9;
    // Pin the target in place so it stays in range for the whole window.
    const pin = e.x;
    for (let i = 0; i < 6 / GAME.fixedStep; i++) {
      e.x = pin;
      w.step(GAME.fixedStep);
      w.drainEvents(log.sink);
    }
    const shots = log.of('attack').filter((a) => a.sourceKind === 'turret').length;
    const expected = 6 / tower.attack.cooldown;
    assert.ok(Math.abs(shots - expected) <= 1, `shots ${shots} vs ${expected}`);
  });

  it('targets the nearest of several enemies', () => {
    const w = makeWorld();
    const far = w.spawnUnit('enemy', 'brute');
    const near = w.spawnUnit('enemy', 'brute');
    far.x = playerTurretX + 14;
    near.x = playerTurretX + 6;
    far.health = near.health = 1e6;
    run(w, 1.2);
    assert.ok(near.health < 1e6, 'near target shot');
    assert.equal(far.health, 1e6, 'far target untouched');
  });

  it('can kill and awards the owner gold and xp', () => {
    const w = makeWorld();
    const e = w.spawnUnit('enemy', 'soldier');
    e.x = playerTurretX + 8;
    e.health = tower.attack.damage; // one bolt
    const gold = w.teams.player.gold;
    run(w, 1.5);
    assert.ok(!e.alive);
    assert.equal(w.teams.player.xp, e.def.xpReward);
    assert.ok(w.teams.player.gold >= gold + e.def.goldReward);
  });

  it('enemy turret defends the enemy base too', () => {
    const w = makeWorld();
    const p = w.spawnUnit('player', 'brute');
    p.x = GAME.baseOffset - GAME.turretMounts[0]!.forward - 8;
    p.health = 1e6;
    run(w, 1.5);
    assert.ok(p.health < 1e6);
  });

  it('turret upgrade raises damage and range', () => {
    const w = makeWorld();
    w.teams.player.gold = 1000;
    assert.equal(w.purchaseUpgrade('player', 'ballista_tuning'), 'ok');
    const log = new EventLog();
    const e = w.spawnUnit('enemy', 'brute');
    e.x = playerTurretX + tower.attack.range + 2; // outside base range, inside upgraded range
    e.health = 1e6;
    run(w, 1.5, log);
    const hit = log.of('hit').find((h) => h.targetKind === 'unit');
    assert.ok(hit);
    assert.ok(Math.abs(hit.damage - tower.attack.damage * 1.3) < 1e-9);
  });
});

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { GAME } from '../src/config/game';
import { UNITS } from '../src/config/units';
import { DT, EventLog, makeWorld, run, runUntil } from './helpers';

const soldier = UNITS.soldier!;
const archer = UNITS.archer!;

describe('melee combat', () => {
  it('a lone soldier marches to the enemy base and damages it in whole hits', () => {
    const w = makeWorld();
    const s = w.spawnUnit('player', 'soldier');
    s.health = 1e6; // survive the enemy turret
    const x0 = s.x;
    run(w, 5);
    assert.ok(s.x > x0 + 10, 'advances');
    assert.equal(s.state, 'advancing');
    run(w, 20);
    assert.equal(s.state, 'attacking');
    const dmg = GAME.baseMaxHealth - w.bases.enemy.health;
    assert.ok(dmg > 0, 'base takes damage');
    assert.equal(Math.round(dmg) % soldier.attack.damage, 0);
  });

  it('respects the attack cooldown', () => {
    const w = makeWorld();
    const log = new EventLog();
    const s = w.spawnUnit('player', 'soldier');
    s.health = 1e6; // survive the enemy turret
    assert.ok(runUntil(w, () => s.state === 'attacking', 30, log) >= 0);
    log.all.length = 0;
    run(w, 8, log);
    const swings = log.of('attack').filter((e) => e.sourceKind === 'unit').length;
    const expected = 8 / soldier.attack.cooldown;
    assert.ok(Math.abs(swings - expected) <= 1, `swings ${swings} vs ${expected}`);
  });

  it('two opposing soldiers detect each other, stop at attack range and fight to a death', () => {
    const w = makeWorld();
    const log = new EventLog();
    const a = w.spawnUnit('player', 'soldier');
    const b = w.spawnUnit('enemy', 'soldier');
    a.health = 130; // identical units trade fatal blows on the same tick; give one an edge
    assert.ok(runUntil(w, () => a.state === 'attacking' || b.state === 'attacking', 30, log) >= 0);
    const gap = Math.abs(a.x - b.x) - a.def.radius - b.def.radius;
    assert.ok(gap <= soldier.attack.range + 0.01, `gap ${gap}`);
    assert.ok(runUntil(w, () => !a.alive || !b.alive, 30, log) >= 0, 'someone died');
    const winner = a.alive ? a : b;
    const loser = a.alive ? b : a;
    assert.equal(loser.health, 0);
    assert.ok(winner.health > 0 && winner.health < winner.maxHealth);
    const death = log.of('death')[0]!;
    assert.equal(death.unitId, loser.id);
    assert.equal(death.killerTeam, winner.team);
  });

  it('corpses are removed after the linger window', () => {
    const w = makeWorld();
    w.spawnUnit('player', 'soldier');
    w.spawnUnit('enemy', 'soldier');
    run(w, 40);
    assert.equal(w.units.filter((u) => !u.alive).length, 0);
  });

  it('allies queue in a column without overlapping', () => {
    const w = makeWorld();
    for (let i = 0; i < 6; i++) w.spawnUnit('player', 'soldier');
    run(w, 6);
    const xs = w.alive.player.map((u) => u.x);
    for (let i = 1; i < xs.length; i++) {
      assert.ok(xs[i]! - xs[i - 1]! >= soldier.radius * 2 - 1e-6, `overlap at ${i}`);
    }
  });
});

describe('ranged combat', () => {
  it('an archer engages from range with a projectile, not instantly', () => {
    const w = makeWorld();
    const log = new EventLog();
    const a = w.spawnUnit('player', 'archer');
    const t = w.spawnUnit('enemy', 'soldier');
    a.x = 0;
    t.x = 9;
    t.health = 1e6; // keep the target alive
    run(w, 0.05, log);
    assert.equal(a.state, 'attacking');
    assert.equal(log.count('projectileFired'), 1);
    assert.equal(log.count('hit'), 0, 'damage waits for impact');
    run(w, 1, log);
    const hit = log.of('hit').find((h) => h.targetKind === 'unit');
    assert.ok(hit, 'arrow lands');
    assert.equal(hit.damage, archer.attack.damage);
    assert.equal(t.health, 1e6 - archer.attack.damage * log.of('hit').length);
  });

  it('archers outrange melee: target takes damage before it can reach back', () => {
    const w = makeWorld();
    const a = w.spawnUnit('player', 'archer');
    const t = w.spawnUnit('enemy', 'soldier');
    a.x = 0;
    t.x = 12;
    run(w, 1.5);
    assert.ok(t.health < t.maxHealth);
    assert.equal(a.health, a.maxHealth);
  });

  it('archers can shoot the enemy base', () => {
    const w = makeWorld();
    const a = w.spawnUnit('player', 'archer');
    a.x = GAME.baseOffset - GAME.baseRadius - 8;
    run(w, 3);
    assert.ok(w.bases.enemy.health < GAME.baseMaxHealth);
  });
});

describe('projectiles', () => {
  it('travel toward the target and are recycled on impact', () => {
    const w = makeWorld();
    const log = new EventLog();
    const a = w.spawnUnit('player', 'archer');
    const t = w.spawnUnit('enemy', 'soldier');
    a.x = 0;
    t.x = 10;
    t.health = 1e6;
    run(w, DT * 2, log);
    assert.equal(w.projectiles.length, 1);
    const p = w.projectiles[0]!;
    const x1 = p.x;
    run(w, DT * 5, log);
    assert.ok(w.projectiles[0]!.x > x1, 'moves toward the target');
    assert.ok(p.y > 0, 'arcs above the ground');
    run(w, 1, log);
    const impacts = log.of('projectileImpact');
    assert.ok(impacts.length >= 1 && impacts[0]!.hit);
    assert.equal(log.count('projectileFired') - impacts.length, w.projectiles.length);
  });

  it('a target dying mid-flight yields a miss and no stray damage', () => {
    const w = makeWorld();
    const log = new EventLog();
    const a = w.spawnUnit('player', 'archer');
    const t = w.spawnUnit('enemy', 'soldier');
    const bystander = w.spawnUnit('enemy', 'soldier');
    a.x = 0;
    t.x = 10;
    bystander.x = 30;
    run(w, DT * 2, log);
    assert.equal(w.projectiles.length, 1);
    t.health = 0; // dies at the end of the next tick
    run(w, 1, log);
    const first = log.of('projectileImpact')[0]!;
    assert.equal(first.hit, false);
    assert.equal(bystander.health, bystander.maxHealth);
    assert.equal(t.health, 0);
  });

  it('keeps every position finite across a busy ranged battle', () => {
    const w = makeWorld();
    for (let i = 0; i < 20; i++) {
      w.spawnUnit('player', i % 2 ? 'archer' : 'soldier');
      w.spawnUnit('enemy', i % 2 ? 'archer' : 'brute');
    }
    run(w, 60);
    for (const p of w.projectiles) assert.ok(Number.isFinite(p.x + p.y + p.z));
    for (const u of w.units) assert.ok(Number.isFinite(u.x));
  });
});

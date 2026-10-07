import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { GAME } from '../src/config/game';
import { UNITS } from '../src/config/units';
import { contentWithUnit, makeWorld, run, runUntil } from './helpers';

const soldier = UNITS.soldier!;

describe('production queue', () => {
  it('charges gold up front and spawns after the unit spawn time', () => {
    const w = makeWorld();
    w.teams.player.gold = 100;
    assert.equal(w.enqueueUnit('player', 'soldier'), 'ok');
    assert.equal(w.teams.player.queue.length, 1);
    run(w, soldier.spawnTime - 0.2);
    assert.equal(w.alive.player.length, 0, 'not yet');
    run(w, 0.4);
    assert.equal(w.alive.player.length, 1);
    assert.equal(w.teams.player.queue.length, 0);
  });

  it('builds queued units one after another', () => {
    const w = makeWorld();
    w.teams.player.gold = 500;
    for (let i = 0; i < 3; i++) assert.equal(w.enqueueUnit('player', 'soldier'), 'ok');
    run(w, soldier.spawnTime + 0.1);
    assert.equal(w.alive.player.length, 1);
    run(w, soldier.spawnTime);
    assert.equal(w.alive.player.length, 2);
    run(w, soldier.spawnTime);
    assert.equal(w.alive.player.length, 3);
  });

  it('rejects unaffordable, locked, unknown and over-capacity requests without side effects', () => {
    const w = makeWorld();
    w.teams.player.gold = 10;
    assert.equal(w.enqueueUnit('player', 'soldier'), 'unaffordable');
    assert.equal(w.teams.player.gold, 10);
    assert.equal(w.teams.player.queue.length, 0);

    w.teams.player.gold = 1000;
    assert.equal(w.enqueueUnit('player', 'archer'), 'locked');
    assert.equal(w.enqueueUnit('player', 'nope'), 'unknown-unit');

    for (let i = 0; i < GAME.economy.queueSize; i++) assert.equal(w.enqueueUnit('player', 'soldier'), 'ok');
    const before = w.teams.player.gold;
    assert.equal(w.enqueueUnit('player', 'soldier'), 'queue-full');
    assert.equal(w.teams.player.gold, before);
  });

  it('cancelling refunds the full cost', () => {
    const w = makeWorld();
    w.teams.player.gold = 100;
    w.enqueueUnit('player', 'soldier');
    w.enqueueUnit('player', 'soldier');
    assert.equal(w.teams.player.gold, 100 - 2 * soldier.cost);
    assert.ok(w.cancelQueued('player', 1));
    assert.equal(w.teams.player.gold, 100 - soldier.cost);
    assert.equal(w.teams.player.queue.length, 1);
    assert.equal(w.cancelQueued('player', 5), false);
  });

  it('instant-spawn units still never overlap at the exit', () => {
    const w = makeWorld({ content: contentWithUnit('soldier', { spawnTime: 0 }) });
    w.teams.player.gold = 500;
    for (let i = 0; i < 5; i++) w.enqueueUnit('player', 'soldier');
    run(w, 4);
    assert.equal(w.alive.player.length, 5);
    const xs = w.alive.player.map((u) => u.x);
    for (let i = 1; i < xs.length; i++) assert.ok(xs[i]! - xs[i - 1]! >= soldier.radius * 2);
  });

  it('works for the enemy team with the same rules', () => {
    const w = makeWorld();
    w.teams.enemy.gold = 100;
    assert.equal(w.enqueueUnit('enemy', 'soldier'), 'ok');
    assert.ok(runUntil(w, () => w.alive.enemy.length === 1, 5) >= 0);
  });
});

describe('economy', () => {
  it('both teams earn passive income', () => {
    const w = makeWorld();
    const p0 = w.teams.player.gold;
    const e0 = w.teams.enemy.gold;
    run(w, 10);
    assert.ok(Math.abs(w.teams.player.gold - (p0 + 10 * GAME.economy.baseIncomePerSec)) < 0.5);
    assert.ok(w.teams.enemy.gold > e0);
  });

  it('the enemy economy follows its difficulty profile', () => {
    const easy = makeWorld({ difficulty: 'easy' });
    const hard = makeWorld({ difficulty: 'hard' });
    const e0 = easy.teams.enemy.gold;
    const h0 = hard.teams.enemy.gold;
    run(easy, 20);
    run(hard, 20);
    const easyGain = easy.teams.enemy.gold - e0;
    const hardGain = hard.teams.enemy.gold - h0;
    assert.ok(hardGain > easyGain * 1.5, `${hardGain} vs ${easyGain}`);
    // The player's economy is unaffected by difficulty.
    assert.ok(Math.abs(easy.teams.player.gold - hard.teams.player.gold) < 1e-6);
  });

  it('kills pay the killing team only', () => {
    const w = makeWorld();
    const a = w.spawnUnit('player', 'soldier');
    const b = w.spawnUnit('enemy', 'soldier');
    b.health = 1; // dies to the first hit
    const eGold = w.teams.enemy.gold;
    const pGold = w.teams.player.gold;
    run(w, 15);
    assert.ok(!b.alive && a.alive);
    const passive = w.time * GAME.economy.baseIncomePerSec;
    assert.ok(Math.abs(w.teams.player.gold - pGold - passive - UNITS.soldier!.goldReward) < 0.5, 'player got the bounty');
    assert.ok(Math.abs(w.teams.enemy.gold - eGold - passive) < 0.5, 'enemy only earned passive income');
  });

  it('Trade Routes adds income', () => {
    const w = makeWorld();
    w.teams.player.gold = 100;
    w.purchaseUpgrade('player', 'trade_routes');
    const g0 = w.teams.player.gold;
    run(w, 10);
    assert.ok(Math.abs(w.teams.player.gold - g0 - 10 * (GAME.economy.baseIncomePerSec + 2)) < 0.5);
  });
});

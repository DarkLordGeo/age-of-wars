import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { GAME } from '../src/config/game';
import { UNITS } from '../src/config/units';
import { EventLog, makeWorld, run, twoAgeContent } from './helpers';

describe('XP and unlocks', () => {
  it('kills grant XP to the killer team only', () => {
    const w = makeWorld();
    w.spawnUnit('player', 'soldier');
    const e = w.spawnUnit('enemy', 'soldier');
    e.health = 1;
    run(w, 15);
    assert.equal(w.teams.player.xp, UNITS.soldier!.xpReward);
    assert.equal(w.teams.enemy.xp, 0);
  });

  it('units unlock when XP reaches their threshold', () => {
    const w = makeWorld();
    const ts = w.teams.player;
    ts.gold = 1000;
    assert.equal(w.unitUnlocked('player', 'soldier'), true);
    assert.equal(w.unitUnlocked('player', 'archer'), false);
    assert.equal(w.enqueueUnit('player', 'archer'), 'locked');
    ts.xp = 60;
    assert.equal(w.unitUnlocked('player', 'archer'), true);
    assert.equal(w.enqueueUnit('player', 'archer'), 'ok');
    assert.equal(w.unitUnlocked('player', 'brute'), false);
    ts.xp = 200;
    assert.equal(w.enqueueUnit('player', 'brute'), 'ok');
  });
});

describe('ages', () => {
  it('cannot advance without enough XP, or past the last age', () => {
    const single = makeWorld();
    single.teams.player.xp = 1e6;
    assert.equal(single.canAdvanceAge('player'), false);
    assert.equal(single.advanceAge('player'), false);

    const w = makeWorld({ content: twoAgeContent() });
    w.teams.player.xp = 99;
    assert.equal(w.canAdvanceAge('player'), false);
    assert.equal(w.advanceAge('player'), false);
  });

  it('advancing swaps the turret type and emits an event', () => {
    const w = makeWorld({ content: twoAgeContent() });
    const log = new EventLog();
    w.teams.player.xp = 100;
    assert.equal(w.advanceAge('player'), true);
    w.drainEvents(log.sink);
    assert.equal(w.teams.player.ageIndex, 1);
    assert.equal(w.bases.player.turrets[0]!.def.id, 'heavy');
    assert.equal(w.bases.enemy.turrets[0]!.def.id, 'watchtower', 'other team unaffected');
    assert.equal(log.of('ageAdvanced')[0]!.ageId, 'second');
    assert.equal(w.canAdvanceAge('player'), false, 'no further ages');
  });
});

describe('upgrades', () => {
  it('purchasing charges gold, applies once, and refuses duplicates', () => {
    const w = makeWorld();
    w.teams.player.gold = 300;
    assert.equal(w.purchaseUpgrade('player', 'sharpened_weapons'), 'ok');
    assert.equal(w.teams.player.gold, 300 - 120);
    assert.equal(w.purchaseUpgrade('player', 'sharpened_weapons'), 'unavailable');
    assert.equal(w.purchaseUpgrade('player', 'nope'), 'unavailable');
    w.teams.player.gold = 10;
    assert.equal(w.purchaseUpgrade('player', 'hardened_armor'), 'unaffordable');
  });

  it('unit damage modifier shows up in combat', () => {
    const w = makeWorld();
    const log = new EventLog();
    w.teams.player.gold = 500;
    w.purchaseUpgrade('player', 'sharpened_weapons');
    w.spawnUnit('player', 'soldier');
    const b = w.spawnUnit('enemy', 'brute');
    b.health = 1e6;
    run(w, 20, log);
    const hit = log.of('hit').find((h) => h.targetId === b.id)!;
    assert.ok(Math.abs(hit.damage - UNITS.soldier!.attack.damage * 1.15) < 1e-9);
  });

  it('health modifier applies to newly trained units', () => {
    const w = makeWorld();
    w.teams.player.gold = 500;
    const before = w.spawnUnit('player', 'soldier');
    w.purchaseUpgrade('player', 'hardened_armor');
    const after = w.spawnUnit('player', 'soldier');
    assert.equal(before.maxHealth, 100);
    assert.equal(after.maxHealth, 120);
  });

  it('base upgrade raises max and current base health', () => {
    const w = makeWorld();
    w.teams.player.gold = 500;
    w.bases.player.health = 400;
    w.purchaseUpgrade('player', 'reinforced_walls');
    assert.equal(w.bases.player.maxHealth, GAME.baseMaxHealth + 500);
    assert.equal(w.bases.player.health, 900);
  });

  it('prerequisites gate availability', () => {
    const w = makeWorld({ content: twoAgeContent() });
    const ts = w.teams.player;
    ts.gold = 1000;
    ts.xp = 100;
    w.advanceAge('player');
    assert.equal(w.purchaseUpgrade('player', 'extra'), 'unavailable');
    w.purchaseUpgrade('player', 'sharpened_weapons');
    assert.equal(w.purchaseUpgrade('player', 'extra'), 'ok');
  });
});

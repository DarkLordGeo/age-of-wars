import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { EventLog, makeWorld, run, twoAgeContent } from './helpers';

const aiWorld = (difficulty: string, opts: { content?: ReturnType<typeof twoAgeContent> } = {}) =>
  makeWorld({ ai: true, difficulty, ...opts });

describe('enemy AI', () => {
  it('spends its own gold and never touches the player economy', () => {
    const w = aiWorld('normal');
    const playerGold0 = w.teams.player.gold;
    const log = new EventLog();
    run(w, 30, log);
    assert.ok(log.of('spawn').some((e) => e.team === 'enemy'), 'AI trains units');
    assert.ok(!log.of('spawn').some((e) => e.team === 'player'));
    // Player gold is untouched apart from passive income + kill rewards.
    assert.ok(w.teams.player.gold >= playerGold0);
    assert.ok(w.teams.enemy.gold < w.teams.enemy.queue.length * 0 + 400, 'AI does not hoard');
  });

  it('difficulty changes how much it builds', () => {
    const counts: Record<string, number> = {};
    for (const d of ['easy', 'normal', 'hard']) {
      const w = aiWorld(d);
      const log = new EventLog();
      run(w, 90, log);
      counts[d] = log.of('spawn').filter((e) => e.team === 'enemy').length;
    }
    assert.ok(counts.easy! < counts.hard!, JSON.stringify(counts));
    assert.ok(counts.easy! <= counts.normal! && counts.normal! <= counts.hard!, JSON.stringify(counts));
  });

  it('only trains units it has unlocked, and diversifies once it can', () => {
    const w = aiWorld('hard');
    const log = new EventLog();
    run(w, 30, log);
    const early = new Set(log.of('spawn').filter((e) => e.team === 'enemy').map((e) => w.units.find((u) => u.id === e.unitId)?.def.id));
    early.delete(undefined);
    assert.ok([...early].every((id) => id === 'soldier'), `early units: ${[...early]}`);

    const w2 = aiWorld('hard');
    w2.teams.enemy.xp = 500;
    const log2 = new EventLog();
    const roles = new Set<string>();
    for (let i = 0; i < 120 * 60; i++) {
      w2.step(1 / 60);
      w2.drainEvents(log2.sink);
      for (const u of w2.alive.enemy) roles.add(u.def.id);
    }
    assert.ok(roles.has('archer') || roles.has('brute'), `roles: ${[...roles]}`);
  });

  it('spends its reserve only when the base is under threat', () => {
    const calm = aiWorld('normal');
    calm.teams.enemy.gold = 25; // cost 25 but reserve is 20
    const farAway = calm.spawnUnit('player', 'soldier');
    farAway.x = -30;
    run(calm, 1.2);
    assert.equal(calm.teams.enemy.queue.length + calm.alive.enemy.length, 0, 'saves its gold when calm');

    const threatened = aiWorld('normal');
    threatened.teams.enemy.gold = 25;
    const raider = threatened.spawnUnit('player', 'soldier');
    raider.x = 30; // close to the enemy base at x=40
    raider.health = 1e6;
    run(threatened, 2);
    assert.ok(threatened.teams.enemy.queue.length + threatened.alive.enemy.length >= 1, 'reacts to threat');
  });

  it('buys upgrades when rich and calm (normal+), never on easy', () => {
    const rich = aiWorld('normal');
    rich.teams.enemy.gold = 2000;
    run(rich, 6);
    assert.ok(rich.teams.enemy.upgrades.size > 0);

    const easy = aiWorld('easy');
    easy.teams.enemy.gold = 2000;
    run(easy, 6);
    assert.equal(easy.teams.enemy.upgrades.size, 0);
  });

  it('advances its age when it has the XP', () => {
    const w = aiWorld('normal', { content: twoAgeContent() });
    w.teams.enemy.xp = 150;
    run(w, 3);
    assert.equal(w.teams.enemy.ageIndex, 1);
  });

  it('is deterministic for a given seed', () => {
    const snap = (w: ReturnType<typeof aiWorld>) => JSON.stringify(w.alive.enemy.map((u) => [u.def.id, +u.x.toFixed(3)]));
    const a = aiWorld('normal');
    const b = aiWorld('normal');
    run(a, 40);
    run(b, 40);
    assert.equal(snap(a), snap(b));
  });
});

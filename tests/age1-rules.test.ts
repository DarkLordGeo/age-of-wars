import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { GAME } from '../src/config/game';
import { frames, u } from '../src/config/original';
import { TURRETS } from '../src/config/turrets';
import { UNITS } from '../src/config/units';
import { EventLog, makeWorld, run, runUntil } from './helpers';

/** Pins the Age 1 rules from docs/AGE1_SPEC.md. */
describe('Age 1 roster (spec numbers)', () => {
  it('units', () => {
    assert.deepEqual(Object.keys(UNITS), ['clubman', 'slingshot', 'dino']);
    assert.deepEqual([UNITS.clubman!.cost, UNITS.slingshot!.cost, UNITS.dino!.cost], [15, 25, 100]);
    assert.deepEqual([UNITS.clubman!.maxHealth, UNITS.slingshot!.maxHealth, UNITS.dino!.maxHealth], [55, 42, 160]);
    assert.equal(UNITS.clubman!.melee.damage, 16);
    assert.equal(UNITS.slingshot!.ranged!.damage, 8);
    assert.equal(UNITS.dino!.melee.damage, 40);
    assert.ok(Math.abs(UNITS.dino!.spawnTime - frames(100)) < 1e-9);
    assert.ok(Math.abs(UNITS.clubman!.speed - u(40)) < 1e-9);
  });

  it('turrets', () => {
    assert.deepEqual(Object.keys(TURRETS), ['rock_slingshot', 'egg_automatic', 'primitive_catapult']);
    assert.deepEqual(Object.values(TURRETS).map((t) => t.cost), [100, 200, 500]);
  });

  it('unit scale: base to base is 900 original units = 80 m', () => {
    assert.ok(Math.abs(u(900) - 80) < 1e-9);
    assert.equal(2 * GAME.baseOffset, 80);
  });
});

describe('Age 1 economy', () => {
  it('starts with 175 gold, 500 base HP and no passive income', () => {
    const w = makeWorld();
    assert.equal(w.teams.player.gold, 175);
    assert.equal(w.bases.player.maxHealth, 500);
    run(w, 20);
    assert.equal(w.teams.player.gold, 175);
  });

  it('training costs gold; cancelling refunds it', () => {
    const w = makeWorld();
    assert.equal(w.enqueueUnit('player', 'clubman'), 'ok');
    assert.equal(w.teams.player.gold, 160);
    assert.ok(w.cancelQueued('player', 0));
    assert.equal(w.teams.player.gold, 175);
    assert.equal(w.enqueueUnit('player', 'dino'), 'ok');
    assert.equal(w.enqueueUnit('player', 'dino'), 'unaffordable');
  });

  it('a kill pays round(1.3 x cost) gold, 2x that XP to the killer and half to the victim', () => {
    const w = makeWorld();
    const victim = w.spawnUnit('enemy', 'clubman', 0);
    w.spawnUnit('player', 'dino', -1);
    const log = new EventLog();
    assert.ok(runUntil(w, () => victim.state === 'dead', 30, log) >= 0);
    const reward = Math.round(1.3 * 15);
    assert.equal(w.killReward(UNITS.clubman!), reward);
    assert.equal(w.teams.player.gold, 175 + reward);
    assert.equal(w.teams.player.xp, 2 * reward);
    assert.equal(w.teams.enemy.xp, Math.floor(reward / 2));
    assert.ok(log.of('death').some((e) => e.killerTeam === 'player'));
  });
});

describe('Age 1 lane rules', () => {
  it('units walk single file and never pass each other', () => {
    const w = makeWorld();
    w.spawnUnit('enemy', 'dino', 0).health = 1e6;
    const a = w.spawnUnit('player', 'clubman', -10);
    const b = w.spawnUnit('player', 'clubman', -14);
    for (let i = 0; i < 600; i++) {
      w.step(GAME.fixedStep);
      w.drainEvents(() => undefined);
      assert.ok(b.x <= a.x - a.def.length + 1e-6, `b ${b.x} passed a ${a.x}`);
    }
  });

  it('everyone targets the front enemy unit', () => {
    const w = makeWorld();
    const front = w.spawnUnit('enemy', 'clubman', 0);
    const back = w.spawnUnit('enemy', 'clubman', 3);
    w.spawnUnit('player', 'slingshot', -6);
    run(w, 6);
    assert.ok(front.health < front.maxHealth);
    assert.equal(back.health, back.maxHealth);
  });
});

describe('Age 1 turrets and slots', () => {
  it('builds into the first free slot, sells for 50%', () => {
    const w = makeWorld();
    assert.equal(w.buildTurret('player', 'rock_slingshot'), 'ok');
    assert.equal(w.teams.player.gold, 75);
    assert.equal(w.buildTurret('player', 'rock_slingshot'), 'no-free-slot');
    assert.equal(w.sellTurret('player', 0), 'ok');
    assert.equal(w.teams.player.gold, 125);
    assert.equal(w.sellTurret('player', 0), 'empty-slot');
  });

  it('extra slots cost 1000 / 3000 / 7500 and sit higher up the tower', () => {
    const w = makeWorld();
    w.teams.player.gold = 20000;
    const costs: number[] = [];
    while (w.nextSlotCost('player') !== null) {
      costs.push(w.nextSlotCost('player')!);
      assert.equal(w.buySlot('player'), 'ok');
    }
    assert.deepEqual(costs, [1000, 3000, 7500]);
    assert.equal(w.buySlot('player'), 'max-slots');
    for (let s = 0; s < 4; s++) assert.equal(w.buildTurret('player', 'egg_automatic', s), 'ok');
    const ys = w.bases.player.turrets.map((t) => t!.y);
    assert.deepEqual(ys, [...GAME.slotHeights]);
  });

  it('a turret shoots an approaching enemy', () => {
    const w = makeWorld();
    w.buildTurret('player', 'rock_slingshot');
    const e = w.spawnUnit('enemy', 'dino', -12);
    e.health = 1e6;
    const log = new EventLog();
    run(w, 6, log);
    assert.ok(log.of('attack').some((a) => a.sourceKind === 'turret' && a.team === 'player'));
    assert.ok(e.health < 1e6);
  });
});

describe('original enemy AI', () => {
  const aiWorld = (difficulty: string) => makeWorld({ ai: true, difficulty });

  it('trains for free, caps at 6 units, and only clubmen/slingshots early', () => {
    const w = aiWorld('normal');
    const log = new EventLog();
    let peak = 0;
    for (let i = 0; i < Math.round(30 / GAME.fixedStep); i++) {
      w.step(GAME.fixedStep);
      w.drainEvents(log.sink);
      peak = Math.max(peak, w.alive.enemy.length);
    }
    assert.ok(log.of('spawn').some((e) => e.team === 'enemy'));
    assert.ok(peak <= 6, `peak ${peak}`);
    assert.equal(w.teams.enemy.gold, 175);
    const early = new Set(w.units.filter((x) => x.team === 'enemy').map((x) => x.def.id));
    assert.ok(!early.has('dino'), [...early].join());
  });

  it('is deterministic for a given seed', () => {
    const trace = (): string => {
      const w = aiWorld('hard');
      const log = new EventLog();
      run(w, 60, log);
      return log.of('spawn').map((e) => `${e.unitId}`).join(',');
    };
    assert.equal(trace(), trace());
  });
});

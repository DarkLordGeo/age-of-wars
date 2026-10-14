import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CONTENT } from '../src/config/content';
import { GAME } from '../src/config/game';
import type { Content } from '../src/config/schema';
import { UNITS } from '../src/config/units';
import type { SimEvent } from '../src/sim/types';
import { segmentBox, type World } from '../src/sim/World';
import { DT, makeWorld } from './helpers';

type Ev<T extends SimEvent['type']> = Extract<SimEvent, { type: T }>;

/** Step until `stop` returns true (or `seconds` pass), collecting events. */
function run(w: World, seconds: number, stop?: (events: SimEvent[]) => boolean): SimEvent[] {
  const all: SimEvent[] = [];
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    w.step(DT);
    const evs: SimEvent[] = [];
    w.drainEvents((e) => evs.push(e));
    all.push(...evs);
    if (stop?.(evs)) break;
  }
  return all;
}
const of = <T extends SimEvent['type']>(evs: SimEvent[], type: T): Ev<T>[] => evs.filter((e): e is Ev<T> => e.type === type);
const SLING = UNITS.slingshot!.ranged!;

/** A slingshot man standing in range of a (stationary) enemy clubman. */
function duel(content?: Content) {
  const w = makeWorld(content ? { content } : {});
  const shooter = w.spawnUnit('player', 'slingshot', -6);
  const target = w.spawnUnit('enemy', 'clubman', -6 + SLING.range + GAME.minUnitGap - 0.5);
  target.health = 1e6;
  shooter.health = 1e6;
  return { w, shooter, target };
}

describe('projectile hit detection', () => {
  it('segment-vs-box sweep: first entry, misses, and a segment that starts inside', () => {
    assert.equal(segmentBox(0, 1, 10, 1, 4, 6, 0, 2), 0.4);
    assert.equal(segmentBox(0, 3, 10, 3, 4, 6, 0, 2), null, 'passes above');
    assert.equal(segmentBox(0, 1, 3, 1, 4, 6, 0, 2), null, 'stops short');
    assert.equal(segmentBox(5, 1, 9, 1, 4, 6, 0, 2), 0, 'starts inside');
    assert.ok(Math.abs(segmentBox(0, 4, 10, -4, 4, 6, 0, 2)! - 0.4) < 1e-9, 'diagonal enters through the side');
    assert.ok(Math.abs(segmentBox(5, 4, 5, -4, 4, 6, 0, 2)! - 0.25) < 1e-9, 'falling stone enters through the top');
  });

  it('direct hit: no damage at release, exactly one hit of the sling damage on impact', () => {
    const { w, target } = duel();
    const before = target.health;
    const evs = run(w, 3, (e) => of(e, 'projectileFired').length > 0);
    const fired = of(evs, 'projectileFired')[0]!;
    assert.equal(fired.defId, 'sling_stone');
    assert.equal(target.health, before, 'no instant damage when the stone is released');
    assert.ok(Math.abs(fired.y - 1.45) < 1e-9, 'released at hand height');
    const flight = run(w, 2, (e) => of(e, 'projectileImpact').length > 0);
    const impact = of(flight, 'projectileImpact')[0]!;
    assert.equal(impact.hit, true);
    assert.equal(before - target.health, Math.floor(SLING.damage), 'damage applied once, on collision');
    // The impact point is inside the target's body box (visual and damage agree).
    const back = target.x + target.def.length;
    assert.ok(impact.x >= target.x - 0.16 && impact.x <= back + 0.16, `impact x ${impact.x.toFixed(2)}`);
    assert.ok(impact.y >= 0 && impact.y <= target.def.height);
    assert.equal(of(flight, 'hit').filter((h) => h.targetKind === 'unit').length, 1);
  });

  it('the stone flies a visible ballistic arc (rises above the release height, then falls)', () => {
    const { w } = duel();
    run(w, 3, (e) => of(e, 'projectileFired').length > 0);
    const p = w.projectiles[0]!;
    let peak = p.y;
    let wentDown = false;
    for (let i = 0; i < 60 && w.projectiles.length; i++) {
      w.step(DT);
      w.drainEvents(() => undefined);
      if (!w.projectiles.length) break;
      peak = Math.max(peak, p.y);
      if (p.vy < 0) wentDown = true;
    }
    assert.ok(peak > 1.6, `arc peak ${peak.toFixed(2)} m`);
    assert.ok(wentDown);
  });

  it('a miss deals no damage: the target dies before the stone arrives and nothing is behind it', () => {
    const { w, target, shooter } = duel();
    run(w, 3, (e) => of(e, 'projectileFired').length > 0);
    target.health = 0; // dies this step (e.g. killed by someone else)
    shooter.health = 0; // no more shots
    const evs = run(w, 3, (e) => of(e, 'projectileImpact').length > 0);
    const impact = of(evs, 'projectileImpact')[0]!;
    assert.equal(impact.hit, false, 'lands on the ground');
    assert.equal(of(evs, 'hit').length, 0, 'no damage anywhere');
    assert.equal(w.projectiles.length, 0, 'cleaned up');
  });

  it('moving target: the shot leads a walking enemy and hits it', () => {
    const w = makeWorld();
    const shooter = w.spawnUnit('player', 'slingshot', -20);
    shooter.health = 1e6;
    const walker = w.spawnUnit('enemy', 'clubman', -20 + SLING.range + GAME.minUnitGap + 3); // walks into range
    walker.health = 1e6;
    const before = walker.health;
    run(w, 4, (e) => of(e, 'projectileFired').length > 0);
    assert.ok(walker.moving, 'target still walking when the stone leaves');
    const evs = run(w, 2, (e) => of(e, 'projectileImpact').length > 0);
    assert.equal(of(evs, 'projectileImpact')[0]!.hit, true);
    assert.equal(before - walker.health, Math.floor(SLING.damage));
  });

  it('a very fast projectile (several metres per step) cannot tunnel through a unit', () => {
    const fast: Content = { ...CONTENT, projectiles: { ...CONTENT.projectiles, sling_stone: { ...CONTENT.projectiles.sling_stone!, speed: 600, gravity: 0 } } };
    const { w, target } = duel(fast);
    const before = target.health;
    const evs = run(w, 3, (e) => of(e, 'projectileImpact').length > 0);
    assert.ok(600 * DT > target.def.length, 'one step is longer than the body');
    assert.equal(of(evs, 'projectileImpact')[0]!.hit, true);
    assert.equal(before - target.health, Math.floor(SLING.damage));
  });

  it('no duplicate damage: one stone, one hit, even with two enemies in its path', () => {
    const w = makeWorld();
    const shooter = w.spawnUnit('player', 'slingshot', -6);
    const a = w.spawnUnit('enemy', 'clubman', -6 + SLING.range + GAME.minUnitGap - 0.5);
    const b = w.spawnUnit('enemy', 'clubman', a.x + GAME.minUnitGap + a.def.length);
    for (const u of [shooter, a, b]) u.health = 1e6;
    run(w, 3, (e) => of(e, 'projectileFired').length > 0);
    shooter.health = 0;
    const evs = run(w, 3);
    assert.equal(of(evs, 'projectileImpact').length, 1);
    assert.equal(of(evs, 'hit').filter((h) => h.targetKind === 'unit').length, 1, 'exactly one damage event');
    assert.equal(1e6 - b.health, 0, 'the unit behind is not hit too');
  });

  it('turret shots still never hit a base; unit shots at the base damage it on impact', () => {
    const w = makeWorld();
    const shooter = w.spawnUnit('player', 'slingshot', GAME.baseOffset - GAME.baseRadius - 6);
    shooter.health = 1e6;
    const hp = w.bases.enemy.health;
    run(w, 3, (e) => of(e, 'projectileFired').length > 0);
    assert.equal(w.bases.enemy.health, hp, 'no instant base damage');
    const evs = run(w, 2, (e) => of(e, 'projectileImpact').length > 0);
    assert.equal(of(evs, 'projectileImpact')[0]!.hit, true);
    assert.equal(hp - w.bases.enemy.health, Math.floor(SLING.damage));
  });
});

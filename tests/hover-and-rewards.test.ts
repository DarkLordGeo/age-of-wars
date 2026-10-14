import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Ray, Vector3 } from 'three';
import { createSoldierPlaceholder } from '../src/assets/placeholders';
import { UNITS } from '../src/config/units';
import { EventBus } from '../src/game/EventBus';
import { pickHovered } from '../src/render/hover';
import { bindRewardPopups, coinText, REWARD_POPUP, RewardPopups } from '../src/render/RewardPopups';
import { UnitView } from '../src/render/UnitView';
import type { SimEvent } from '../src/sim/types';
import { DT, makeWorld } from './helpers';

/** A view of a fresh unit (placeholder model) standing at lane x. */
function viewAt(x: number, team: 'player' | 'enemy' = 'enemy') {
  const w = makeWorld();
  const u = w.spawnUnit(team, 'clubman', x);
  const v = new UnitView('k', createSoldierPlaceholder(0x888888), new Map());
  v.bind(u);
  v.update(0, null);
  return { w, u, v };
}

/** A ray straight down onto world (x, z), like the pointer over a unit seen from above. */
const downAt = (x: number, z: number) => new Ray(new Vector3(x, 30, z), new Vector3(0, -1, 0));

describe('hover health bars', () => {
  it('picks the unit under the pointer (nearest along the ray), never a dead one', () => {
    const a = viewAt(-5);
    const b = viewAt(5);
    const pa = a.v.root.position;
    assert.equal(pickHovered(downAt(pa.x, pa.z), [a.v, b.v]), a.u.id);
    assert.equal(pickHovered(downAt(pa.x + 20, pa.z), [a.v, b.v]), null, 'nothing under the pointer');
    // Looking along the lane: the closer unit wins.
    const along = new Ray(new Vector3(-30, 1, a.v.root.position.z), new Vector3(1, 0, 0));
    b.v.root.position.z = a.v.root.position.z;
    assert.equal(pickHovered(along, [b.v, a.v]), a.u.id);
    a.u.state = 'dead';
    assert.equal(pickHovered(downAt(pa.x, pa.z), [a.v]), null, 'the dead are not hoverable');
  });

  it('hovered: a red bar even at full health, showing the exact health share and updating at once', () => {
    const { u, v } = viewAt(0);
    assert.equal(v.barState.visible, false, 'full health, not hovered: no bar (as before)');
    v.setHovered(true);
    v.update(0, null);
    assert.deepEqual(v.barState, { visible: true, red: true, frac: 1 });
    u.health = u.maxHealth * 0.4;
    v.update(1 / 60, null);
    assert.ok(Math.abs(v.barState.frac - 0.4) < 1e-9, 'damage shows on the next frame');
    v.setHovered(false);
    v.update(1 / 60, null);
    assert.deepEqual({ visible: v.barState.visible, red: v.barState.red }, { visible: true, red: true }, 'damaged units show a red bar too');
    u.health = u.maxHealth;
    v.update(1 / 60, null);
    assert.equal(v.barState.visible, false, 'pointer gone and healthy: hidden');
    u.health = u.maxHealth * 50; // e.g. a debug or future heal above max
    v.setHovered(true);
    v.update(1 / 60, null);
    assert.equal(v.barState.frac, 1, 'never wider than full');
  });

  it('one colour in every situation: damaged, hit in combat, hovered or not, near or far (no fog, no tone mapping)', () => {
    const { u, v } = viewAt(0);
    const fill = () => (v as unknown as { fill: { material: { color: { getHex(): number }; fog: boolean; toneMapped: boolean } } }).fill.material;
    const first = fill();
    const seen = new Set<number>();
    const look = () => {
      v.update(1 / 60, null);
      assert.equal(fill(), first, 'the same material throughout');
      seen.add(fill().color.getHex());
    };
    u.health = u.maxHealth * 0.7;
    look();
    v.triggerHit(); // struck in combat
    look();
    v.setHovered(true);
    look();
    v.setHovered(false);
    u.state = 'attacking';
    look();
    assert.equal(seen.size, 1);
    assert.equal(first.fog, false, 'distance fog never tints it');
    assert.equal(first.toneMapped, false, 'shown as the configured colour');
  });

  it('hidden when the hovered unit dies, and a pooled view starts un-hovered', () => {
    const { w, u, v } = viewAt(0);
    v.setHovered(true);
    u.state = 'dead';
    v.update(1 / 60, null);
    assert.equal(v.barState.visible, false);
    v.bind(w.spawnUnit('enemy', 'clubman', 3)); // the view is reused for another unit
    v.update(0, null);
    assert.equal(v.barState.visible, false);
  });
});

describe('coin reward indicators', () => {
  it(`read exactly "Coin <n> +"`, () => {
    assert.equal(coinText(25), 'Coin 25 +');
    assert.equal(coinText(130), 'Coin 130 +');
  });

  it('appear once per enemy death that pays the player, with the amount the sim credited', () => {
    const bus = new EventBus();
    const popups = new RewardPopups();
    bindRewardPopups(bus, popups, () => ({ x: 0, y: 2, z: 0 }));
    const w = makeWorld();
    const victim = w.spawnUnit('enemy', 'clubman', 0);
    w.spawnUnit('player', 'dino', -1);
    const gold0 = w.teams.player.gold;
    const deaths: Array<Extract<SimEvent, { type: 'death' }>> = [];
    for (let i = 0; i < Math.round(20 / DT) && victim.alive; i++) {
      w.step(DT);
      w.drainEvents((e) => {
        if (e.type === 'death') deaths.push(e);
        bus.dispatch(e);
      });
    }
    assert.equal(deaths.length, 1);
    assert.equal(deaths[0]!.gold, w.teams.player.gold - gold0, 'the event carries the coins actually added');
    assert.equal(deaths[0]!.gold, w.killReward(UNITS.clubman!));
    assert.equal(popups.spawned, 1, 'exactly one indicator');
    assert.equal(popups.popups[0]!.text, coinText(deaths[0]!.gold));
    // Not for coins the enemy earns, nor for a death that pays nothing.
    bus.dispatch({ type: 'death', unitId: 9, team: 'player', killerTeam: 'enemy', gold: 20 });
    bus.dispatch({ type: 'death', unitId: 9, team: 'enemy', killerTeam: 'player', gold: 0 });
    assert.equal(popups.spawned, 1);
  });

  it('float up, fade in and out, then free their slot; stagger when several land together', () => {
    const popups = new RewardPopups();
    const a = popups.spawn(20, 0, 2, 0);
    const b = popups.spawn(20, 0.5, 2, 0);
    const c = popups.spawn(130, 0.2, 2, 0.1);
    assert.deepEqual([a.lift, b.lift, c.lift].map((l) => l / REWARD_POPUP.stagger), [0, 1, 2], 'stacked, readable');
    const far = popups.spawn(20, 30, 2, 0);
    assert.equal(far.lift, 0, 'a reward elsewhere is not pushed up');
    assert.equal(popups.opacity(a), 0, 'fades in');
    const h0 = popups.height(a);
    popups.update(0.5);
    assert.equal(popups.opacity(a), 1);
    assert.ok(popups.height(a) > h0, 'rises');
    popups.update(0);
    assert.equal(a.age, 0.5, 'paused: frozen');
    popups.update(REWARD_POPUP.life);
    assert.equal(popups.active, 0, 'expired');
    for (let i = 0; i < 50; i++) popups.spawn(20, i, 2, 0);
    assert.ok(popups.popups.length <= REWARD_POPUP.pool, 'pooled, never grows past the pool');
    popups.clear();
    assert.equal(popups.active, 0, 'cleared for a new match');
  });
});

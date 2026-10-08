import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { World } from '../src/sim/World';

/** The main menu's background battle: both teams AI-driven. */
describe('attract mode (AI vs AI)', () => {
  it('drives the player team too, and both sides field armies', () => {
    const w = new World({ difficulty: 'normal', autoPlayer: 'normal', seed: 7 });
    assert.ok(w.playerAi);
    assert.equal(w.playerAi.team, 'player');
    let playerSpawned = 0;
    let enemySpawned = 0;
    for (let i = 0; i < 60 * 60; i++) {
      w.step(1 / 60);
      w.drainEvents((e) => {
        if (e.type === 'spawn') (e.team === 'player' ? playerSpawned++ : enemySpawned++);
      });
    }
    assert.ok(playerSpawned >= 3, `player spawned ${playerSpawned}`);
    assert.ok(enemySpawned >= 3, `enemy spawned ${enemySpawned}`);
  });

  it('keeps fighting (no idle stalemate) over several minutes', () => {
    const w = new World({ difficulty: 'normal', autoPlayer: 'normal', seed: 3 });
    let lateSpawns = 0;
    let lateDeaths = 0;
    for (let i = 0; i < 60 * 60 * 6 && w.status === 'playing'; i++) {
      w.step(1 / 60);
      const late = w.time > 5 * 60;
      w.drainEvents((e) => {
        if (!late) return;
        if (e.type === 'spawn') lateSpawns++;
        if (e.type === 'death') lateDeaths++;
      });
    }
    // Either a side has won (the menu starts a new battle) or units are still clashing.
    if (w.status === 'playing') assert.ok(lateSpawns > 5 && lateDeaths > 5, `minute 6: ${lateSpawns} spawns, ${lateDeaths} deaths`);
  });

  it('a normal match has no player AI', () => {
    assert.equal(new World({ difficulty: 'normal' }).playerAi, null);
  });
});

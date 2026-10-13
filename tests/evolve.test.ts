import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CONTENT } from '../src/config/content';
import type { Content } from '../src/config/schema';
import { evolveTip } from '../src/ui/evolve';
import { makeWorld } from './helpers';

/** Content with a second (test-only) age, to prove evolving still works once one exists. */
const twoAges: Content = {
  ...CONTENT,
  ages: [CONTENT.ages[0]!, { ...CONTENT.ages[0]!, id: 'test_age', name: 'Test Age', xpRequired: 4000, baseHealth: 1100 }],
};

describe('Evolve button (#8)', () => {
  it('Age 1 is the only age: no evolve is offered, even past 4000 XP', () => {
    const w = makeWorld();
    assert.match(evolveTip(w), /^Next age not available yet \(0 \/ 4000 XP\)$/);
    w.teams.player.xp = 5000;
    assert.equal(w.canAdvanceAge('player'), false);
    assert.equal(w.advanceAge('player'), false);
    assert.equal(w.teams.player.ageIndex, 0);
    assert.match(evolveTip(w), /not available yet \(5000 \/ 4000 XP\)/);
    assert.doesNotMatch(evolveTip(w), /^Evolve/);
  });

  it('with a second age defined, the button enables at its XP threshold', () => {
    const w = makeWorld({ content: twoAges });
    w.teams.player.xp = 3999;
    assert.equal(w.canAdvanceAge('player'), false);
    assert.equal(evolveTip(w), 'Evolve to Test Age (4000 XP)');
    w.teams.player.xp = 4000;
    assert.equal(w.canAdvanceAge('player'), true);
    assert.equal(evolveTip(w), 'Evolve to Test Age');
    assert.equal(w.advanceAge('player'), true);
    assert.equal(w.teams.player.ageIndex, 1);
    assert.equal(w.bases.player.maxHealth, 1100);
    assert.equal(w.bases.player.health, 1100);
    assert.equal(w.canAdvanceAge('player'), false);
  });
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countOverlaps, countTraits, scopeOf, splitTraits, unknownSets } from '../src/count.js';
import { rankPairs } from '../docs/pairs.js';

const campaign = { name: 'Test', packs: ['p1'] };
const card = (type_code, traits, quantity, extra = {}) => ({
  pack_code: 'p1',
  encounter_code: 'set',
  type_code,
  traits,
  quantity,
  ...extra,
});

const cards = [
  card('enemy', 'Creature. Monster.', 2), // 2 copies
  card('treachery', 'Hazard.', 3), // 3 copies
  // Two-sided: a room that flips into an enemy-location. Half a copy per side.
  card('location', 'Room. Dormant.', 1, { code: 'c', linked_to_code: 'cb' }),
  card('enemy_location', 'Room. Monster. Monster.', 1, { code: 'cb', hidden: true }), // duplicate trait counts once
  // Two-sided with an uncounted front: an asset whose back is an enemy.
  card('asset', 'Ally. Resident.', 1, { code: 'e', linked_to_code: 'eb', encounter_code: null }),
  card('enemy', 'Humanoid. Resident. Elite.', 1, { code: 'eb', hidden: true }),
  card('asset', 'Item.', 2), // not a counted type
  card('enemy', 'Monster.', 1, { encounter_code: null }), // weakness: no encounter set
  card('enemy', 'Creature.', 4, { pack_code: 'p2' }), // other campaign
];

const byName = (traits) => Object.fromEntries(traits.map((t) => [t.trait, t]));

test('splitTraits splits on periods and trims', () => {
  assert.deepEqual(splitTraits('Hemlock Vale. Central.'), ['Hemlock Vale', 'Central']);
  assert.deepEqual(splitTraits(' Monster.  Elite. '), ['Monster', 'Elite']);
  assert.deepEqual(splitTraits(null), []);
  assert.deepEqual(splitTraits(''), []);
});

test('countTraits filters cards and weights by quantity', () => {
  const r = countTraits(cards, campaign);
  assert.equal(r.cards, 5);
  assert.equal(r.copies, 6.5); // 2 + 3 + 0.5 + 0.5 + 0.5
  const t = byName(r.traits);
  assert.equal(t.Hazard.total, 3);
  assert.equal(t.Creature.total, 2);
  assert.equal(t.Item, undefined);
  assert.equal(t.Ally, undefined);
  assert.equal(r.traits[0].trait, 'Hazard');
});

test('two-sided cards count half a copy per side', () => {
  const t = byName(countTraits(cards, campaign).traits);
  assert.equal(t.Room.total, 1); // 0.5 front + 0.5 back
  assert.equal(t.Dormant.total, 0.5);
  assert.equal(t.Monster.total, 2.5);
  assert.deepEqual(t.Monster.byType, { enemy: 2, treachery: 0, location: 0, enemy_location: 0.5 });
  assert.equal(t.Resident.total, 0.5); // enemy back of an asset
});

test('countOverlaps counts weighted copies with both traits', () => {
  assert.deepEqual(countOverlaps(cards, campaign), [
    ['Creature', 'Monster', 2],
    ['Dormant', 'Room', 0.5],
    ['Elite', 'Humanoid', 0.5],
    ['Elite', 'Resident', 0.5],
    ['Humanoid', 'Resident', 0.5],
    ['Monster', 'Room', 0.5],
  ]);
});

test('rankPairs uses coverage = A + B - both', () => {
  const { traits } = countTraits(cards, campaign);
  const overlaps = countOverlaps(cards, campaign);
  const [best] = rankPairs(traits, overlaps);
  assert.deepEqual(best, { a: 'Hazard', b: 'Monster', coverage: 5.5, overlap: 0, onlyA: 3, onlyB: 2.5 });

  const pair = rankPairs(traits, overlaps).find((p) => p.a === 'Monster' && p.b === 'Creature');
  assert.equal(pair.coverage, 2.5); // 2.5 + 2 - 2
  assert.equal(pair.overlap, 2);
});

test('rankPairs with a fixed trait lists it first', () => {
  const { traits } = countTraits(cards, campaign);
  const pairs = rankPairs(traits, countOverlaps(cards, campaign), { fixed: 'Creature', limit: 2 });
  assert.ok(pairs.every((p) => p.a === 'Creature'));
  assert.deepEqual(
    pairs.map((p) => [p.b, p.coverage]),
    [
      ['Hazard', 5],
      ['Room', 3],
    ],
  );
});

// Scenarios select by encounter set, across packs.
const scenarioCards = [
  card('enemy', 'Ghoul. Monster.', 3, { pack_code: 'core', encounter_code: 'ghouls' }),
  card('treachery', 'Hazard.', 2, { encounter_code: 'rock' }),
  card('enemy', 'Creature.', 1, { encounter_code: 'forest' }),
];
const withScenarios = {
  name: 'With scenarios',
  packs: ['p1'],
  scenarios: {
    one: { name: 'One', sets: ['rock', 'ghouls'] },
    two: { name: 'Two', sets: ['forest', 'rock'] },
  },
};

test('scopeOf: scenario sets, campaign union, packs fallback', () => {
  assert.deepEqual(scopeOf(withScenarios, 'one'), { sets: ['rock', 'ghouls'] });
  assert.deepEqual(scopeOf(withScenarios), { sets: ['rock', 'ghouls', 'forest'] });
  assert.deepEqual(scopeOf(campaign), { packs: ['p1'] });
});

test('scenario counts include sets from other packs', () => {
  const one = countTraits(scenarioCards, scopeOf(withScenarios, 'one'));
  assert.equal(one.copies, 5); // 3 ghouls (core pack) + 2 rock
  assert.equal(byName(one.traits).Ghoul.total, 3);
  assert.equal(byName(one.traits).Creature, undefined);
  assert.equal(countTraits(scenarioCards, scopeOf(withScenarios)).copies, 6);
});

test('unknownSets reports set codes no card uses', () => {
  const typo = { x: { name: 'X', scenarios: { s: { name: 'S', sets: ['rock', 'rokc'] } } } };
  assert.deepEqual(unknownSets(scenarioCards, typo), [{ campaign: 'x', scenario: 's', set: 'rokc' }]);
  assert.deepEqual(unknownSets(scenarioCards, { withScenarios }), []);
});

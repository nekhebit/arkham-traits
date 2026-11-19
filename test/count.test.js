import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countOverlaps, countTraits, splitTraits } from '../src/count.js';
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
  card('enemy', 'Creature. Monster.', 2),
  card('enemy', 'Monster. Elite.', 1, { hidden: true }), // flip side: counted
  card('treachery', 'Hazard.', 3),
  card('location', 'Room. Dormant.', 1),
  card('enemy_location', 'Room. Monster. Monster.', 1), // duplicate trait counts once
  card('asset', 'Item.', 2), // not a counted type
  card('enemy', 'Monster.', 1, { encounter_code: null }), // weakness: no encounter set
  card('enemy', 'Creature.', 4, { pack_code: 'p2' }), // other campaign
];

test('splitTraits splits on periods and trims', () => {
  assert.deepEqual(splitTraits('Hemlock Vale. Central.'), ['Hemlock Vale', 'Central']);
  assert.deepEqual(splitTraits(' Monster.  Elite. '), ['Monster', 'Elite']);
  assert.deepEqual(splitTraits(null), []);
  assert.deepEqual(splitTraits(''), []);
});

test('countTraits filters cards and weights by quantity', () => {
  const r = countTraits(cards, campaign);
  assert.equal(r.cards, 5);
  assert.equal(r.copies, 8);
  const byName = Object.fromEntries(r.traits.map((t) => [t.trait, t]));
  assert.equal(byName.Monster.total, 4);
  assert.deepEqual(byName.Monster.byType, { enemy: 3, treachery: 0, location: 0, enemy_location: 1 });
  assert.equal(byName.Creature.total, 2);
  assert.equal(byName.Hazard.total, 3);
  assert.equal(byName.Room.total, 2);
  assert.equal(byName.Item, undefined);
  assert.equal(r.traits[0].trait, 'Monster');
});

test('countOverlaps counts copies with both traits', () => {
  assert.deepEqual(countOverlaps(cards, campaign), [
    ['Creature', 'Monster', 2],
    ['Dormant', 'Room', 1],
    ['Elite', 'Monster', 1],
    ['Monster', 'Room', 1],
  ]);
});

test('rankPairs uses coverage = A + B - both', () => {
  const { traits } = countTraits(cards, campaign);
  const overlaps = countOverlaps(cards, campaign);
  const [best] = rankPairs(traits, overlaps);
  assert.deepEqual(best, { a: 'Monster', b: 'Hazard', coverage: 7, overlap: 0, onlyA: 4, onlyB: 3 });

  const creatureMonster = rankPairs(traits, overlaps).find((p) => p.a === 'Monster' && p.b === 'Creature');
  assert.equal(creatureMonster.coverage, 4); // 4 + 2 - 2
  assert.equal(creatureMonster.overlap, 2);
});

test('rankPairs with a fixed trait lists it first', () => {
  const { traits } = countTraits(cards, campaign);
  const pairs = rankPairs(traits, countOverlaps(cards, campaign), { fixed: 'Creature', limit: 2 });
  assert.equal(pairs.length, 2);
  assert.ok(pairs.every((p) => p.a === 'Creature'));
  assert.deepEqual(
    pairs.map((p) => [p.b, p.coverage]),
    [
      ['Hazard', 5],
      ['Monster', 4],
    ],
  );
});

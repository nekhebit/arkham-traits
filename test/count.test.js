import { test } from 'node:test';
import assert from 'node:assert/strict';
import { campaignProblems, countOverlaps, countTraits, hasSkillTest, parseWeight, scopeOf, splitTraits } from '../src/count.js';
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
    one: { name: 'One', weight: '1/2', sets: ['rock', 'ghouls'] },
    two: { name: 'Two', sets: ['forest', 'rock'] }, // weight defaults to 1
  },
};

test('parseWeight reads numbers and fractions', () => {
  assert.equal(parseWeight(undefined), 1);
  assert.equal(parseWeight(0.25), 0.25);
  assert.equal(parseWeight('5/7'), 5 / 7);
  assert.ok(Number.isNaN(parseWeight('half')));
});

test('scopeOf: scenario sets, campaign modes, packs fallback', () => {
  assert.deepEqual(scopeOf(withScenarios, 'one'), { sets: ['rock', 'ghouls'] });
  assert.deepEqual(scopeOf(withScenarios, null, 'once'), { sets: ['rock', 'ghouls', 'forest'] });
  assert.deepEqual(scopeOf(withScenarios), {
    parts: [
      { sets: ['rock', 'ghouls'], weight: 0.5 },
      { sets: ['forest', 'rock'], weight: 1 },
    ],
  });
  assert.deepEqual(scopeOf(campaign), { packs: ['p1'] });
});

test('scenario counts include sets from other packs', () => {
  const one = countTraits(scenarioCards, scopeOf(withScenarios, 'one'));
  assert.equal(one.copies, 5); // 3 ghouls (core pack) + 2 rock
  assert.equal(byName(one.traits).Ghoul.total, 3);
  assert.equal(byName(one.traits).Creature, undefined);
  assert.equal(countTraits(scenarioCards, scopeOf(withScenarios, null, 'once')).copies, 6);
});

test('expected mode counts a set once per scenario, times its weight', () => {
  const r = countTraits(scenarioCards, scopeOf(withScenarios));
  const t = byName(r.traits);
  assert.equal(t.Hazard.total, 3); // rock: 2 copies x (0.5 + 1)
  assert.equal(t.Ghoul.total, 1.5); // ghouls: 3 x 0.5
  assert.equal(t.Creature.total, 1); // forest: 1 x 1
  assert.equal(r.copies, 5.5);
});

test('campaignProblems reports unknown sets, bad weights and reserved ids', () => {
  const bad = {
    x: {
      name: 'X',
      scenarios: {
        s: { name: 'S', sets: ['rock', 'rokc'] },
        t: { name: 'T', weight: '3/2', sets: ['rock'] },
        once: { name: 'Once', sets: ['rock'] },
        tested: { name: 'Tested', sets: ['rock'] },
      },
    },
  };
  assert.deepEqual(
    campaignProblems(scenarioCards, bad).map((p) => `${p.scenario}: ${p.problem}`),
    ['s: unknown encounter set "rokc"', 't: weight "3/2" is not between 0 and 1', 'once: "once" is reserved for the page URL', 'tested: "tested" is reserved for the page URL'],
  );
  assert.deepEqual(campaignProblems(scenarioCards, { withScenarios }), []);
});

test('hasSkillTest: fight/evade, shroud, or "test" in treachery text', () => {
  assert.equal(hasSkillTest({ type_code: 'enemy', enemy_fight: 3, enemy_evade: 2 }), true);
  assert.equal(hasSkillTest({ type_code: 'enemy', enemy_fight: null, enemy_evade: null, text: 'Aloof.' }), false);
  assert.equal(hasSkillTest({ type_code: 'location', shroud: 2 }), true);
  assert.equal(hasSkillTest({ type_code: 'treachery', text: 'Revelation - Test [willpower] (3).' }), true);
  assert.equal(hasSkillTest({ type_code: 'treachery', real_text: 'Revelation - Place 1 doom on the agenda.' }), false);
  assert.equal(hasSkillTest({ type_code: 'treachery', text: 'Contestant.' }), false); // whole word only
});

test('testedOnly drops cards without a skill test', () => {
  const mixed = [
    card('treachery', 'Hazard.', 2, { text: 'Test [agility] (2).' }),
    card('treachery', 'Hazard. Power.', 3, { text: 'Place 1 doom.' }),
    card('enemy', 'Creature.', 1, { enemy_fight: 2, enemy_evade: 2 }),
  ];
  const all = countTraits(mixed, campaign);
  const tested = countTraits(mixed, campaign, { testedOnly: true });
  assert.equal(all.copies, 6);
  assert.equal(tested.copies, 3);
  assert.equal(byName(tested.traits).Hazard.total, 2);
  assert.equal(byName(tested.traits).Power, undefined);
  assert.deepEqual(countOverlaps(mixed, campaign, { testedOnly: true }), []);
});

test('bestSets and upgradePath maximise coverage', async () => {
  const { bestSets, upgradePath } = await import('../src/sets.js');
  const deck = [
    card('treachery', 'Hazard.', 4),
    card('enemy', 'Mutated. Monster.', 3),
    card('location', 'Dark.', 2),
    card('treachery', 'Power.', 1),
    card('enemy', 'Monster.', 1),
  ];
  const selected = (await import('../src/count.js')).campaignCards(deck, campaign);
  const [best3] = bestSets(selected, 3, 1);
  assert.deepEqual(best3, { traits: ['Hazard', 'Monster', 'Dark'], coverage: 10 });
  assert.deepEqual(
    upgradePath(selected, 4).map((p) => [p.traits.join('+'), p.coverage]),
    [
      ['Hazard+Monster', 8],
      ['Hazard+Monster+Dark', 10],
      ['Hazard+Monster+Dark+Power', 11],
    ],
  );
});

test('spreadScorers: per-scenario shares, weighted average and worst case', async () => {
  const { spreadScorers } = await import('../src/sets.js');
  const a = [card('enemy', 'Dark.', 1), card('enemy', 'Monster.', 1)]; // Dark 50%
  const b = [card('enemy', 'Monster.', 2)]; // Dark 0%
  const { shares, avg, worst } = spreadScorers([a, b].map((x) => x.map((c) => ({ ...c, weight: c.quantity }))), [1, 0.5]);
  assert.deepEqual(shares(['Dark']), [0.5, 0]);
  assert.equal(avg(['Dark']), (0.5 * 1 + 0 * 0.5) / 1.5);
  assert.equal(worst(['Dark']), 0);
  assert.equal(worst(['Monster']), 0.5);
});

test('pathFrom ends at the best set even when greedy steps would not', async () => {
  const { pathFrom } = await import('../src/sets.js');
  // Scores built so the best pair (A+B) is not inside the best triple (A+C+D).
  const table = { 'A,B': 10, 'A,C': 6, 'A,D': 5, 'B,C': 4, 'B,D': 3, 'C,D': 7, 'A,B,C': 11, 'A,B,D': 11, 'A,C,D': 20, 'B,C,D': 9 };
  const score = (set) => table[[...set].sort().join()];
  const path = pathFrom(['A', 'B', 'C', 'D'], score, 3);
  assert.deepEqual(path.map((p) => p.traits.join('+')), ['C+D', 'C+D+A']);
  assert.equal(path.at(-1).score, 20);
});

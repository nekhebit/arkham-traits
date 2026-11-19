// Recomputes a whole-campaign view in the browser from the compact card
// table (src/table.js) and per-scenario chances (docs/structure.js).
// Produces the same shapes as scripts/build.js.
import { bestSets, pathFrom, rankSets, spreadScorers, topTraits, upgradePath } from './sets.js';

const r3 = (n) => Math.round(n * 1000) / 1000;

function viewOf(types, list) {
  let copies = 0;
  const byTrait = new Map();
  const both = new Map();
  for (const c of list) {
    copies += c.weight;
    for (const t of c.traits) {
      let e = byTrait.get(t);
      if (!e) byTrait.set(t, (e = { trait: t, total: 0, byType: Object.fromEntries(types.map((x) => [x, 0])) }));
      e.total += c.weight;
      e.byType[c.type] += c.weight;
    }
    const sorted = [...c.traits].sort();
    for (let i = 0; i < sorted.length; i++)
      for (let j = i + 1; j < sorted.length; j++) {
        const k = `${sorted[i]}\u0000${sorted[j]}`;
        both.set(k, (both.get(k) ?? 0) + c.weight);
      }
  }
  return {
    copies,
    traits: [...byTrait.values()].sort((a, b) => b.total - a.total || a.trait.localeCompare(b.trait)),
    overlaps: [...both]
      .map(([k, n]) => [...k.split('\u0000'), n])
      .sort((p, q) => q[2] - p[2] || p[0].localeCompare(q[0]) || p[1].localeCompare(q[1])),
    upgrades: { path: upgradePath(list, 4), best4: bestSets(list, 4, 5) },
  };
}

// { expected, once, spread } for the campaign, each with a `tested` copy
// (spread as { all, tested }), given chances: { scenarioId: p }.
export function computeCampaign(types, table, chances, scenarioNames) {
  const cards = table.cards.map(([weight, type, tested, traits]) => ({
    weight,
    type: types[type],
    tested: Boolean(tested),
    traits: traits.map((i) => table.traits[i]),
  }));
  const ids = Object.keys(table.scenarios).filter((id) => chances[id] > 0);
  const expectedMult = new Map();
  for (const id of ids)
    for (const i of table.scenarios[id]) expectedMult.set(i, (expectedMult.get(i) ?? 0) + chances[id]);
  const onceMult = new Map([...expectedMult.keys()].map((i) => [i, 1]));

  const listOf = (mult, testedOnly) =>
    [...mult]
      .filter(([i]) => !testedOnly || cards[i].tested)
      .map(([i, m]) => ({ ...cards[i], weight: cards[i].weight * m }));
  const both = (mult) => ({ ...viewOf(types, listOf(mult, false)), tested: viewOf(types, listOf(mult, true)) });

  const spreadFor = (testedOnly) => {
    const per = ids.map((id) => table.scenarios[id].map((i) => cards[i]).filter((c) => !testedOnly || c.tested));
    const { traits, shares, avg, worst } = spreadScorers(per, ids.map((id) => chances[id]));
    const row = (set, score) => ({ traits: set, score: r3(score), shares: shares(set).map(r3) });
    const pool = topTraits(traits, avg);
    const rank = (score) => ({
      path: pathFrom(pool, score, 4).map((p) => row(p.traits, p.score)),
      best4: rankSets(pool, 4, score, 5).map((p) => row(p.traits, p.score)),
    });
    return {
      traits: traits
        .map((t) => ({ trait: t, shares: shares([t]).map(r3), avg: r3(avg([t])), worst: r3(worst([t])) }))
        .sort((a, b) => b.avg - a.avg || a.trait.localeCompare(b.trait)),
      avg: rank(avg),
      worst: rank(worst),
    };
  };

  return {
    expected: both(expectedMult),
    once: both(onceMult),
    spread: {
      scenarios: ids.map((id) => ({ id, name: scenarioNames[id], weight: r3(chances[id]) })),
      all: spreadFor(false),
      tested: spreadFor(true),
    },
  };
}

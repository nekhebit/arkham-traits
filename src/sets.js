// Best trait sets for an upgraded Grizzled (up to 4 recorded traits).
// Works on weighted cards from campaignCards(): [{ weight, traits }].
import { splitTraits } from './count.js';

// Only the most common traits are combined; rarer ones can't win.
export const POOL_SIZE = 16;

function prepare(cards) {
  const rows = cards.map((c) => ({ w: c.weight, t: new Set(splitTraits(c.traits)) }));
  const totals = new Map();
  for (const r of rows) for (const t of r.t) totals.set(t, (totals.get(t) ?? 0) + r.w);
  const pool = [...totals]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, POOL_SIZE)
    .map(([t]) => t);
  return { rows, pool };
}

// Copies with at least one of the traits.
function coverage(rows, traits) {
  let sum = 0;
  for (const r of rows) if (traits.some((t) => r.t.has(t))) sum += r.w;
  return sum;
}

function* combinations(items, k, start = 0, current = []) {
  if (current.length === k) {
    yield [...current];
    return;
  }
  for (let i = start; i < items.length; i++) {
    current.push(items[i]);
    yield* combinations(items, k, i + 1, current);
    current.pop();
  }
}

// Top `limit` sets of `size` traits by coverage: [{ traits, coverage }].
export function bestSets(cards, size, limit = 5) {
  const { rows, pool } = prepare(cards);
  const all = [];
  for (const traits of combinations(pool, size)) all.push({ traits, coverage: coverage(rows, traits) });
  return all
    .sort((a, b) => b.coverage - a.coverage || a.traits.join().localeCompare(b.traits.join()))
    .slice(0, limit);
}

// Start with the best pair, then add the trait that covers the most extra
// copies, up to `maxSize` traits: [{ traits, coverage }] for sizes 2..maxSize.
export function upgradePath(cards, maxSize = 4) {
  const { rows, pool } = prepare(cards);
  const [first] = bestSets(cards, 2, 1);
  if (!first) return [];
  const path = [first];
  while (path.length < maxSize - 1) {
    const current = path.at(-1).traits;
    const options = pool
      .filter((t) => !current.includes(t))
      .map((t) => ({ traits: [...current, t], coverage: coverage(rows, [...current, t]) }))
      .sort((a, b) => b.coverage - a.coverage || a.traits.at(-1).localeCompare(b.traits.at(-1)));
    if (!options.length) break;
    path.push(options[0]);
  }
  return path;
}

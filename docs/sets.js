// Best trait sets for an upgraded Grizzled (up to 4 recorded traits), and how
// evenly traits spread across a campaign's scenarios.
// Works on weighted cards: [{ weight, traits }] (traits as "A. B." text or an array).
// Shared by the page and the Node scripts.

const splitTraits = (traits) =>
  Array.isArray(traits) ? traits : (traits ?? '').split('.').map((t) => t.trim()).filter(Boolean);

// Compare scores at 1e-6 so float noise from summing in a different order
// can't change the order of ties (page and build must agree).
const cmp = (a, b) => Math.round(b * 1e6) - Math.round(a * 1e6);

// Only the most common traits are combined; rarer ones can't win.
export const POOL_SIZE = 16;

// [{ w, t: Set(trait) }]
export function toRows(cards) {
  return cards.map((c) => ({ w: c.weight, t: new Set(splitTraits(c.traits)) }));
}

// Copies with at least one of the traits.
export function coverage(rows, traits) {
  let sum = 0;
  for (const r of rows) if (traits.some((t) => r.t.has(t))) sum += r.w;
  return sum;
}

// The `size` traits with the highest score(rows-free) value among `candidates`.
export function topTraits(candidates, score, size = POOL_SIZE) {
  return candidates
    .map((t) => [t, score([t])])
    .sort((a, b) => cmp(a[1], b[1]) || a[0].localeCompare(b[0]))
    .slice(0, size)
    .map(([t]) => t);
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

// Top `limit` sets of `size` traits from `pool` by score: [{ traits, score }].
export function rankSets(pool, size, score, limit = 5) {
  const all = [];
  for (const traits of combinations(pool, size)) all.push({ traits, score: score(traits) });
  return all.sort((a, b) => cmp(a.score, b.score) || a.traits.join().localeCompare(b.traits.join())).slice(0, limit);
}

// Upgrade path that ends at the best set of maxSize traits: take that set,
// then its best (maxSize - 1)-subset, and so on down to a pair. Adding the
// single best trait step by step can miss the best final set (it does for
// worst-case scores), so we work backwards from the goal.
// Returns [{ traits, score }] for sizes 2..maxSize, in upgrade order.
export function pathFrom(pool, score, maxSize = 4) {
  const [goal] = rankSets(pool, maxSize, score, 1);
  if (!goal) return [];
  const path = [goal];
  while (path[0].traits.length > 2) {
    const [best] = rankSets(path[0].traits, path[0].traits.length - 1, score, 1);
    path.unshift(best);
  }
  // Keep each step's traits in the order they were added.
  for (let i = 1; i < path.length; i++) {
    const added = path[i].traits.filter((t) => !path[i - 1].traits.includes(t));
    path[i] = { ...path[i], traits: [...path[i - 1].traits, ...added] };
  }
  return path;
}

// Coverage-based helpers for one card list: [{ traits, coverage }].
function totalScorer(cards) {
  const rows = toRows(cards);
  const traits = [...new Set(rows.flatMap((r) => [...r.t]))];
  const score = (set) => coverage(rows, set);
  return { pool: topTraits(traits, score), score };
}
const asCoverage = ({ traits, score }) => ({ traits, coverage: score });

export function bestSets(cards, size, limit = 5) {
  const { pool, score } = totalScorer(cards);
  return rankSets(pool, size, score, limit).map(asCoverage);
}

export function upgradePath(cards, maxSize = 4) {
  const { pool, score } = totalScorer(cards);
  return pathFrom(pool, score, maxSize).map(asCoverage);
}

// Spread across scenarios. perScenario: [cards of scenario i], weights: [w_i]
// (chance to play it). share_i(set) = coverage in scenario i / its copies.
//   avg:   weighted average of share_i
//   worst: lowest share_i
export function spreadScorers(perScenario, weights) {
  const rows = perScenario.map(toRows);
  const totals = rows.map((r) => r.reduce((a, c) => a + c.w, 0));
  const wSum = weights.reduce((a, b) => a + b, 0);
  const shares = (set) => rows.map((r, i) => (totals[i] ? coverage(r, set) / totals[i] : 0));
  const avg = (set) => shares(set).reduce((a, s, i) => a + s * weights[i], 0) / wSum;
  const worst = (set) => Math.min(...shares(set));
  const traits = [...new Set(rows.flatMap((r) => r.flatMap((c) => [...c.t])))];
  return { traits, shares, avg, worst };
}

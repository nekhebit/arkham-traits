// Pair ranking for Grizzled. Shared by the web page and the Node scripts.
//
// coverage(A, B) = copies with A or B = total(A) + total(B) - overlap(A, B)
// overlap(A, B)  = copies with both, where Grizzled gives [wild]x4 instead of x2
//
// traits:   [{ trait, total }]
// overlaps: [[traitA, traitB, copies]] with traitA < traitB, non-zero only

const key = (a, b) => (a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`);

// Returns pairs sorted by coverage, then overlap, then name.
// With `fixed`, only pairs that contain that trait.
export function rankPairs(traits, overlaps, { fixed = null, limit = Infinity } = {}) {
  const both = new Map(overlaps.map(([a, b, n]) => [key(a, b), n]));
  const pairs = [];
  for (let i = 0; i < traits.length; i++) {
    for (let j = i + 1; j < traits.length; j++) {
      const [x, y] = [traits[i], traits[j]];
      if (fixed && x.trait !== fixed && y.trait !== fixed) continue;
      // With a fixed trait, list it first; otherwise keep the higher-count trait first.
      const [a, b] = fixed === y.trait ? [y, x] : [x, y];
      const overlap = both.get(key(a.trait, b.trait)) ?? 0;
      pairs.push({
        a: a.trait,
        b: b.trait,
        coverage: a.total + b.total - overlap,
        overlap,
        onlyA: a.total - overlap,
        onlyB: b.total - overlap,
      });
    }
  }
  pairs.sort(
    (p, q) => q.coverage - p.coverage || q.overlap - p.overlap || `${p.a}${p.b}`.localeCompare(`${q.a}${q.b}`),
  );
  return pairs.slice(0, limit);
}

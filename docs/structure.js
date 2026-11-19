// Campaign structure: which scenarios can fill each slot (a day or a night),
// and from that, the chance that the rest of a campaign includes a scenario.
// Shared by the page and the Node scripts.
//
// structure = {
//   groups: { free: [scenarioId, ...] },          // optional named lists
//   slots:  [["free"], ["free", "scenarioId"], ...] // per slot: ids or group names
// }
// Every scenario is played at most once, one per slot, in slot order.

export function expandSlots(structure) {
  const groups = structure.groups ?? {};
  return structure.slots.map((options) => [...new Set(options.flatMap((o) => groups[o] ?? [o]))]);
}

// Every distinct set of scenarios a full campaign can consist of, given that
// `played` (in any order) filled the first played.length slots.
// Returns [Set(scenarioId)] including the played ones; empty if impossible.
export function possibleCampaigns(structure, played = []) {
  const slots = expandSlots(structure);
  const done = new Set(played);
  const seen = new Map();
  const used = new Set();
  const walk = (i) => {
    if (i === slots.length) {
      const key = [...used].sort().join('|');
      if (!seen.has(key)) seen.set(key, new Set(used));
      return;
    }
    const early = i < done.size; // played scenarios fill the first slots
    for (const s of slots[i]) {
      if (used.has(s) || early !== done.has(s)) continue;
      used.add(s);
      walk(i + 1);
      used.delete(s);
    }
  };
  if (played.length <= slots.length) walk(0);
  return [...seen.values()];
}

// Chance per scenario that the rest of the campaign includes it, assuming
// every possible combination of scenarios is equally likely. Played
// scenarios get 0 (already done). Returns { chances: {id: p}, combinations }
// or null if `played` doesn't fit the structure.
export function remainingChances(structure, played = []) {
  const combos = possibleCampaigns(structure, played);
  if (!combos.length) return null;
  const ids = new Set(expandSlots(structure).flat());
  const chances = {};
  for (const id of ids) {
    chances[id] = played.includes(id) ? 0 : combos.filter((c) => c.has(id)).length / combos.length;
  }
  return { chances, combinations: combos.length };
}

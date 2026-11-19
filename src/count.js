// Trait counting for the Grizzled skill card.
// Grizzled gets [wild][wild] per chosen trait on the encounter card a skill
// test is made on or against, so we count traits on those card types.

import { expandSlots, remainingChances } from '../docs/structure.js';

export const COUNTED_TYPES = ['enemy', 'treachery', 'location', 'enemy_location'];

// "Creature. Monster. Mutated." -> ["Creature", "Monster", "Mutated"]
export function splitTraits(traits) {
  return (traits ?? '')
    .split('.')
    .map((t) => t.trim())
    .filter(Boolean);
}

// Scenario weight: a number or a fraction string like "5/7" (the chance
// that a playthrough includes the scenario). Missing means 1.
export function parseWeight(w) {
  if (w === undefined) return 1;
  if (typeof w === 'number') return w;
  const m = /^\s*(\d+)\s*\/\s*(\d+)\s*$/.exec(String(w));
  return m ? Number(m[1]) / Number(m[2]) : NaN;
}

// Chance per scenario that a playthrough includes it: from the campaign
// `structure` if there is one (optionally after `played` scenarios), else
// each scenario's `weight` (default 1). Returns { id: chance } or null if
// `played` doesn't fit the structure.
export function scenarioWeights(campaign, played = []) {
  if (campaign.structure) return remainingChances(campaign.structure, played)?.chances ?? null;
  return Object.fromEntries(Object.entries(campaign.scenarios ?? {}).map(([id, s]) => [id, parseWeight(s.weight)]));
}

// What to count:
//   { sets: [encounter_code] }              each set once
//   { parts: [{ sets, weight }] }           each set once per part, times its weight
//   { packs: [pack_code] }                  fallback without scenarios
// A scenario is its sets. A campaign with scenarios is built from them, which
// includes reused sets from other packs (like the Core Set):
//   mode "once":     the union of all scenario sets
//   mode "expected": each scenario's sets, weighted by its chance to be played
export function scopeOf(campaign, scenarioId = null, mode = 'expected') {
  if (scenarioId) return { sets: campaign.scenarios[scenarioId].sets };
  const scenarios = Object.values(campaign.scenarios ?? {});
  if (!scenarios.length) return { packs: campaign.packs };
  if (mode === 'once') return { sets: [...new Set(scenarios.flatMap((s) => s.sets))] };
  const weights = scenarioWeights(campaign);
  return { parts: Object.entries(campaign.scenarios).map(([id, s]) => ({ sets: s.sets, weight: weights[id] ?? 0 })) };
}

// Scenario ids the page uses as URL flags (#campaign/once, #campaign/tested).
export const RESERVED_IDS = ['once', 'tested'];

// Problems in campaigns.json that would silently miscount.
// Returns [{ campaign, scenario, problem }].
export function campaignProblems(cards, campaigns) {
  const known = new Set(cards.map((c) => c.encounter_code).filter(Boolean));
  return Object.entries(campaigns).flatMap(([campaign, c]) =>
    Object.entries(c.scenarios ?? {}).flatMap(([scenario, s]) => {
      const problems = s.sets.filter((set) => !known.has(set)).map((set) => `unknown encounter set "${set}"`);
      const w = parseWeight(s.weight);
      if (!(w >= 0 && w <= 1)) problems.push(`weight ${JSON.stringify(s.weight)} is not between 0 and 1`);
      if (RESERVED_IDS.includes(scenario)) problems.push(`"${scenario}" is reserved for the page URL`);
      if (c.structure && s.weight !== undefined) problems.push('has a weight, but the campaign structure sets the chances');
      return problems.map((problem) => ({ campaign, scenario, problem }));
    }),
  ).concat(
    Object.entries(campaigns).flatMap(([campaign, c]) => {
      if (!c.structure) return [];
      const problems = [];
      const inSlots = new Set(expandSlots(c.structure).flat());
      for (const id of inSlots) if (!c.scenarios?.[id]) problems.push(`structure names unknown scenario "${id}"`);
      for (const id of Object.keys(c.scenarios ?? {})) if (!inSlots.has(id)) problems.push(`scenario "${id}" is in no structure slot`);
      if (!remainingChances(c.structure)) problems.push('structure allows no complete campaign');
      return problems.map((problem) => ({ campaign, scenario: 'structure', problem }));
    }),
  );
}

// Encounter cards of the counted types in the scope, each with a
// `weight` in copies (times the scope's multiplier for its set). A two-sided card (front with `linked_to_code`, back is
// the linked card) counts as half a copy per side: you only test against the
// side in play, and we don't know which one that is. A side of a type we
// don't count (an asset or act front, say) still takes its half.
// Heuristic: can Grizzled apply to this card? Enemies need a fight or evade
// value, locations a shroud value, treacheries the word "test" in their text.
// A treachery that only reacts to other tests ("after you fail a test")
// still counts, so treachery numbers may be a bit high.
export function hasSkillTest(card) {
  const text = card.real_text ?? card.text ?? '';
  if (card.type_code === 'treachery') return /\btests?\b/i.test(text);
  if (card.type_code === 'location') return card.shroud != null || /\btests?\b/i.test(text);
  return card.enemy_fight != null || card.enemy_evade != null || /\btests?\b/i.test(text);
}

// options.testedOnly: keep only cards where hasSkillTest() is true.
export function campaignCards(cards, scope, { testedOnly = false } = {}) {
  // Multiplier per encounter set; null means "select by pack, multiplier 1".
  let perSet = null;
  if (scope.parts) {
    perSet = new Map();
    for (const part of scope.parts) {
      for (const set of part.sets) perSet.set(set, (perSet.get(set) ?? 0) + part.weight);
    }
  } else if (scope.sets) {
    perSet = new Map(scope.sets.map((set) => [set, 1]));
  }
  const packs = new Set(scope.packs ?? []);
  const multiplier = (c) => (perSet ? (perSet.get(c.encounter_code) ?? 0) : packs.has(c.pack_code) ? 1 : 0);
  const backs = new Set(cards.map((c) => c.linked_to_code).filter(Boolean));
  return cards
    .filter((c) => c.encounter_code && COUNTED_TYPES.includes(c.type_code) && multiplier(c) > 0)
    .filter((c) => !testedOnly || hasSkillTest(c))
    .map((c) => {
      const twoSided = Boolean(c.linked_to_code) || backs.has(c.code);
      return { ...c, weight: (c.quantity ?? 1) * (twoSided ? 0.5 : 1) * multiplier(c) };
    });
}

// Copies that carry both traits, for every pair that appears together.
// Returns [[traitA, traitB, copies]] with traitA < traitB, sorted by copies.
export function countOverlaps(cards, scope, options = {}) {
  const both = new Map();
  for (const card of campaignCards(cards, scope, options)) {
    const qty = card.weight;
    const traits = [...new Set(splitTraits(card.traits))].sort();
    for (let i = 0; i < traits.length; i++) {
      for (let j = i + 1; j < traits.length; j++) {
        const k = `${traits[i]}\u0000${traits[j]}`;
        both.set(k, (both.get(k) ?? 0) + qty);
      }
    }
  }
  return [...both]
    .map(([k, n]) => [...k.split('\u0000'), n])
    .sort((p, q) => q[2] - p[2] || p[0].localeCompare(q[0]) || p[1].localeCompare(q[1]));
}

// Returns { cards, copies, traits: [{ trait, total, share, byType }] },
// sorted by total copies (descending), then trait name.
export function countTraits(cards, scope, options = {}) {
  const selected = campaignCards(cards, scope, options);
  const byTrait = new Map();
  let copies = 0;

  for (const card of selected) {
    const qty = card.weight;
    copies += qty;
    for (const trait of new Set(splitTraits(card.traits))) {
      let entry = byTrait.get(trait);
      if (!entry) {
        entry = { trait, total: 0, byType: Object.fromEntries(COUNTED_TYPES.map((t) => [t, 0])) };
        byTrait.set(trait, entry);
      }
      entry.total += qty;
      entry.byType[card.type_code] += qty;
    }
  }

  const traits = [...byTrait.values()]
    .map((e) => ({ ...e, share: copies ? e.total / copies : 0 }))
    .sort((a, b) => b.total - a.total || a.trait.localeCompare(b.trait));

  return { cards: selected.length, copies, traits };
}

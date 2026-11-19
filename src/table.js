// Compact card table for the page, so it can recompute a campaign in the
// browser (for example after "already played" scenarios). Per card only the
// weight, type, whether it has a skill test, and trait names. No card text.
import { COUNTED_TYPES, campaignCards, hasSkillTest, scopeOf, splitTraits } from './count.js';

export function makeTable(cards, campaign) {
  const traitIndex = new Map();
  const index = new Map(); // card key -> row
  // ArkhamDB cards have a code; fall back to their visible fields (test fixtures).
  const keyOf = (c) => c.code ?? [c.encounter_code, c.type_code, c.name, c.traits, c.quantity].join('|');
  const rows = [];
  const scenarios = {};
  for (const id of Object.keys(campaign.scenarios ?? {})) {
    scenarios[id] = campaignCards(cards, scopeOf(campaign, id)).map((c) => {
      const key = keyOf(c);
      if (!index.has(key)) {
        const traits = [...new Set(splitTraits(c.traits))].map((t) => {
          if (!traitIndex.has(t)) traitIndex.set(t, traitIndex.size);
          return traitIndex.get(t);
        });
        index.set(key, rows.length);
        rows.push([c.weight, COUNTED_TYPES.indexOf(c.type_code), hasSkillTest(c) ? 1 : 0, traits]);
      }
      return index.get(key);
    });
  }
  return { traits: [...traitIndex.keys()], cards: rows, scenarios };
}

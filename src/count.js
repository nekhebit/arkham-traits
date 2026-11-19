// Trait counting for the Grizzled skill card.
// Grizzled gets [wild][wild] per chosen trait on the encounter card a skill
// test is made on or against, so we count traits on those card types.

export const COUNTED_TYPES = ['enemy', 'treachery', 'location', 'enemy_location'];

// "Creature. Monster. Mutated." -> ["Creature", "Monster", "Mutated"]
export function splitTraits(traits) {
  return (traits ?? '')
    .split('.')
    .map((t) => t.trim())
    .filter(Boolean);
}

// Encounter cards of the counted types in the campaign's packs.
// Hidden flip sides are kept: you test against the side in play.
export function campaignCards(cards, campaign) {
  const packs = new Set(campaign.packs);
  return cards.filter(
    (c) => packs.has(c.pack_code) && c.encounter_code && COUNTED_TYPES.includes(c.type_code),
  );
}

// Copies that carry both traits, for every pair that appears together.
// Returns [[traitA, traitB, copies]] with traitA < traitB, sorted by copies.
export function countOverlaps(cards, campaign) {
  const both = new Map();
  for (const card of campaignCards(cards, campaign)) {
    const qty = card.quantity ?? 1;
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
export function countTraits(cards, campaign) {
  const selected = campaignCards(cards, campaign);
  const byTrait = new Map();
  let copies = 0;

  for (const card of selected) {
    const qty = card.quantity ?? 1;
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

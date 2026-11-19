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

// Encounter cards of the counted types in the campaign's packs, each with a
// `weight` in copies. A two-sided card (front with `linked_to_code`, back is
// the linked card) counts as half a copy per side: you only test against the
// side in play, and we don't know which one that is. A side of a type we
// don't count (an asset or act front, say) still takes its half.
export function campaignCards(cards, campaign) {
  const packs = new Set(campaign.packs);
  const inPacks = cards.filter((c) => packs.has(c.pack_code));
  const backs = new Set(inPacks.map((c) => c.linked_to_code).filter(Boolean));
  return inPacks
    .filter((c) => c.encounter_code && COUNTED_TYPES.includes(c.type_code))
    .map((c) => {
      const twoSided = Boolean(c.linked_to_code) || backs.has(c.code);
      return { ...c, weight: (c.quantity ?? 1) * (twoSided ? 0.5 : 1) };
    });
}

// Copies that carry both traits, for every pair that appears together.
// Returns [[traitA, traitB, copies]] with traitA < traitB, sorted by copies.
export function countOverlaps(cards, campaign) {
  const both = new Map();
  for (const card of campaignCards(cards, campaign)) {
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
export function countTraits(cards, campaign) {
  const selected = campaignCards(cards, campaign);
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

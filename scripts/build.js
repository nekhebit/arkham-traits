// Writes docs/traits.json: trait counts per campaign for the web page.
// Contains only trait names and counts (see CLAUDE.md content rules).
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { COUNTED_TYPES, countTraits } from '../src/count.js';

const ROOT = join(import.meta.dirname, '..');
const readJson = async (path) => JSON.parse(await readFile(join(ROOT, path), 'utf8'));

const campaigns = await readJson('campaigns.json');
let cards;
try {
  cards = await readJson('data/cache/api-public-cards.json');
} catch {
  console.error('No card data in data/cache/. Run: npm run fetch');
  process.exit(1);
}

const out = { source: 'ArkhamDB', types: COUNTED_TYPES, campaigns: {} };
for (const [id, campaign] of Object.entries(campaigns)) {
  const { cards: count, copies, traits } = countTraits(cards, campaign);
  out.campaigns[id] = {
    name: campaign.name,
    cards: count,
    copies,
    traits: traits.map(({ trait, total, byType }) => ({ trait, total, byType })),
  };
}

const text = JSON.stringify(out, null, 1) + '\n';
await writeFile(join(ROOT, 'docs', 'traits.json'), text);
console.log(`docs/traits.json: ${Object.keys(out.campaigns).length} campaign(s), ${(text.length / 1e3).toFixed(1)} kB`);

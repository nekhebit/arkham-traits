// Writes docs/traits.json: trait counts per campaign for the web page.
// Contains only trait names and counts (see CLAUDE.md content rules).
import { readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { COUNTED_TYPES, countOverlaps, countTraits } from '../src/count.js';

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

// Fetch date from `npm run fetch`; older caches fall back to the file date.
let dataDate;
try {
  dataDate = (await readJson('data/cache/fetched.json')).date;
} catch {
  dataDate = (await stat(join(ROOT, 'data/cache/api-public-cards.json'))).mtime.toISOString().slice(0, 10);
}

const { version } = await readJson('package.json');
const out = { source: 'ArkhamDB', version, dataDate, types: COUNTED_TYPES, campaigns: {} };
for (const [id, campaign] of Object.entries(campaigns)) {
  const { cards: count, copies, traits } = countTraits(cards, campaign);
  out.campaigns[id] = {
    name: campaign.name,
    cards: count,
    copies,
    traits: traits.map(({ trait, total, byType }) => ({ trait, total, byType })),
    // Only non-zero pairs; the page derives coverage for all pairs (docs/pairs.js).
    overlaps: countOverlaps(cards, campaign),
  };
}

const text = JSON.stringify(out, null, 1) + '\n';
await writeFile(join(ROOT, 'docs', 'traits.json'), text);
console.log(`docs/traits.json: ${Object.keys(out.campaigns).length} campaign(s), ${(text.length / 1e3).toFixed(1)} kB`);

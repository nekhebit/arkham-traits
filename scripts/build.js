// Writes docs/traits.json: trait counts per campaign and scenario for the web page.
// Contains only trait names and counts (see CLAUDE.md content rules).
import { readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { COUNTED_TYPES, countOverlaps, countTraits, scopeOf, unknownSets } from '../src/count.js';

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

// Typos in campaigns.json would silently count nothing, so stop here.
const unknown = unknownSets(cards, campaigns);
if (unknown.length) {
  for (const u of unknown) console.error(`Unknown encounter set "${u.set}" in ${u.campaign}/${u.scenario}`);
  process.exit(1);
}

// Fetch date from `npm run fetch`; older caches fall back to the file date.
let dataDate;
try {
  dataDate = (await readJson('data/cache/fetched.json')).date;
} catch {
  dataDate = (await stat(join(ROOT, 'data/cache/api-public-cards.json'))).mtime.toISOString().slice(0, 10);
}

// { copies, traits, overlaps } for one campaign or scenario.
function counts(scope) {
  const { copies, traits } = countTraits(cards, scope);
  return {
    copies,
    traits: traits.map(({ trait, total, byType }) => ({ trait, total, byType })),
    // Only non-zero pairs; the page derives coverage for all pairs (docs/pairs.js).
    overlaps: countOverlaps(cards, scope),
  };
}

const { version } = await readJson('package.json');
const out = { source: 'ArkhamDB', version, dataDate, types: COUNTED_TYPES, campaigns: {} };
let views = 0;
for (const [id, campaign] of Object.entries(campaigns)) {
  const scenarios = {};
  for (const [sid, s] of Object.entries(campaign.scenarios ?? {})) {
    scenarios[sid] = { name: s.name, ...counts(scopeOf(campaign, sid)) };
    views++;
  }
  out.campaigns[id] = { name: campaign.name, ...counts(scopeOf(campaign)), scenarios };
  views++;
}

const text = JSON.stringify(out) + '\n';
await writeFile(join(ROOT, 'docs', 'traits.json'), text);
console.log(`docs/traits.json: ${views} views (campaigns + scenarios), ${(text.length / 1e3).toFixed(1)} kB`);

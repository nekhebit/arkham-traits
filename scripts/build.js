// Writes docs/traits.json: trait counts per campaign and scenario for the web page.
// Contains only trait names and counts (see CLAUDE.md content rules).
import { readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { COUNTED_TYPES, campaignCards, campaignProblems, countOverlaps, countTraits, scopeOf } from '../src/count.js';
import { bestSets, upgradePath } from '../src/sets.js';

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

// Typos or bad weights in campaigns.json would silently miscount, so stop here.
const problems = campaignProblems(cards, campaigns);
if (problems.length) {
  for (const p of problems) console.error(`campaigns.json ${p.campaign}/${p.scenario}: ${p.problem}`);
  process.exit(1);
}

// Fetch date from `npm run fetch`; older caches fall back to the file date.
let dataDate;
try {
  dataDate = (await readJson('data/cache/fetched.json')).date;
} catch {
  dataDate = (await stat(join(ROOT, 'data/cache/api-public-cards.json'))).mtime.toISOString().slice(0, 10);
}

// { copies, traits, overlaps } for one campaign or scenario, plus the same
// for cards with a skill test only (`tested`, see hasSkillTest).
function countsFor(scope, options) {
  const { copies, traits } = countTraits(cards, scope, options);
  return {
    copies,
    traits: traits.map(({ trait, total, byType }) => ({ trait, total, byType })),
    // Only non-zero pairs; the page derives coverage for all pairs (docs/pairs.js).
    overlaps: countOverlaps(cards, scope, options),
    // For an upgraded Grizzled: best path 2 -> 3 -> 4 traits, and top 4-trait sets.
    upgrades: (() => {
      const selected = campaignCards(cards, scope, options);
      return { path: upgradePath(selected, 4), best4: bestSets(selected, 4, 5) };
    })(),
  };
}
const counts = (scope) => ({ ...countsFor(scope), tested: countsFor(scope, { testedOnly: true }) });

const { version } = await readJson('package.json');
const out = { source: 'ArkhamDB', version, dataDate, types: COUNTED_TYPES, campaigns: {} };
let views = 0;
for (const [id, campaign] of Object.entries(campaigns)) {
  const scenarios = {};
  for (const [sid, s] of Object.entries(campaign.scenarios ?? {})) {
    scenarios[sid] = { name: s.name, ...counts(scopeOf(campaign, sid)) };
    views++;
  }
  // Whole campaign in both modes; the page toggles between them.
  out.campaigns[id] = {
    name: campaign.name,
    expected: counts(scopeOf(campaign, null, 'expected')),
    once: counts(scopeOf(campaign, null, 'once')),
    scenarios,
  };
  views += 2;
}

const text = JSON.stringify(out) + '\n';
await writeFile(join(ROOT, 'docs', 'traits.json'), text);
console.log(`docs/traits.json: ${views} views (campaigns + scenarios), ${(text.length / 1e3).toFixed(1)} kB`);

// Prints trait counts for a campaign.
// Usage: npm run report -- <campaign-id> [--scenario id | --once] [--tested] [--top N] [--pairs [--with Trait]] [--sets]
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { COUNTED_TYPES, countOverlaps, countTraits, scopeOf } from '../src/count.js';
import { rankPairs } from '../docs/pairs.js';

const fmt = (n) => {
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
};
const ROOT = join(import.meta.dirname, '..');
const readJson = async (path) => JSON.parse(await readFile(join(ROOT, path), 'utf8'));

const campaigns = await readJson('campaigns.json');
const args = process.argv.slice(2);
const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const optionValues = new Set(['--top', '--with', '--scenario'].map(option));
const [id] = args.filter((a) => !a.startsWith('--') && !optionValues.has(a));
const top = Number(option('--top') ?? 20);

if (!id || !campaigns[id]) {
  console.log('Usage: npm run report -- <campaign-id> [--scenario id | --once] [--tested] [--top N] [--pairs [--with Trait]] [--sets]\nCampaigns:');
  for (const [key, c] of Object.entries(campaigns)) console.log(`  ${key}  ${c.name}`);
  process.exit(id ? 1 : 0);
}

let cards;
try {
  cards = await readJson('data/cache/api-public-cards.json');
} catch {
  console.error('No card data in data/cache/. Run: npm run fetch');
  process.exit(1);
}

const campaign = campaigns[id];
const scenarioId = option('--scenario') ?? null;
if (scenarioId && !campaign.scenarios?.[scenarioId]) {
  console.error(`Unknown scenario "${scenarioId}". Scenarios: ${Object.keys(campaign.scenarios ?? {}).join(', ')}`);
  process.exit(1);
}
const scope = scopeOf(campaign, scenarioId, args.includes('--once') ? 'once' : 'expected');
const title = scenarioId
  ? `${campaign.scenarios[scenarioId].name} (${campaign.name})`
  : `${campaign.name}, ${scope.parts ? 'expected per playthrough' : 'each set once'}`;
const options = { testedOnly: args.includes('--tested') };
const result = countTraits(cards, scope, options);
console.log(`${title}${options.testedOnly ? ', cards with a skill test' : ''}: ${fmt(result.copies)} encounter copies\n`);

if (args.includes('--sets')) {
  const sets =
    scope.sets ??
    (scope.parts ? [...new Set(scope.parts.flatMap((p) => p.sets))] : null) ??
    [...new Set(cards.filter((c) => scope.packs.includes(c.pack_code)).map((c) => c.encounter_code).filter(Boolean))];
  const rows = sets.map((set) => [set, countTraits(cards, { sets: [set] }).copies]).sort((a, b) => b[1] - a[1]);
  console.log(['Encounter set'.padEnd(28), 'Copies'].join('  '));
  for (const [set, copies] of rows) console.log([set.padEnd(28), fmt(copies).padStart(6)].join('  '));
  process.exit(0);
}

if (args.includes('--pairs')) {
  const fixed = option('--with') ?? null;
  if (fixed && !result.traits.some((t) => t.trait === fixed)) {
    console.error(`Unknown trait "${fixed}" for this campaign.`);
    process.exit(1);
  }
  const pairs = rankPairs(result.traits, countOverlaps(cards, scope, options), { fixed, limit: top });
  console.log(['Pair'.padEnd(28), 'Cover', 'Share', '  Both'].join('  '));
  for (const p of pairs) {
    const share = `${((p.coverage / result.copies) * 100).toFixed(1)}%`;
    console.log(
      [`${p.a} + ${p.b}`.padEnd(28), fmt(p.coverage).padStart(5), share.padStart(5), fmt(p.overlap).padStart(6)].join(
        '  ',
      ),
    );
  }
  process.exit(0);
}

const short = { enemy: 'enemy', treachery: 'treach', location: 'loc', enemy_location: 'en_loc' };
const header = ['Trait'.padEnd(16), 'Total', 'Share', ...COUNTED_TYPES.map((t) => short[t].padStart(6))];
console.log(header.join('  '));
for (const t of result.traits.slice(0, top)) {
  console.log(
    [
      t.trait.padEnd(16),
      fmt(t.total).padStart(5),
      `${(t.share * 100).toFixed(1)}%`.padStart(5),
      ...COUNTED_TYPES.map((type) => (t.byType[type] ? fmt(t.byType[type]) : '').padStart(6)),
    ].join('  '),
  );
}
if (result.traits.length > top) console.log(`\n${result.traits.length - top} more traits (use --top N)`);

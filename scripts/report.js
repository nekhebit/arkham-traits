// Prints trait counts for a campaign.
// Usage: npm run report -- <campaign-id> [--top N] [--pairs [--with Trait]]
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { COUNTED_TYPES, countOverlaps, countTraits } from '../src/count.js';
import { rankPairs } from '../docs/pairs.js';

const ROOT = join(import.meta.dirname, '..');
const readJson = async (path) => JSON.parse(await readFile(join(ROOT, path), 'utf8'));

const campaigns = await readJson('campaigns.json');
const args = process.argv.slice(2);
const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const optionValues = new Set(['--top', '--with'].map(option));
const [id] = args.filter((a) => !a.startsWith('--') && !optionValues.has(a));
const top = Number(option('--top') ?? 20);

if (!id || !campaigns[id]) {
  console.log('Usage: npm run report -- <campaign-id> [--top N] [--pairs [--with Trait]]\nCampaigns:');
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

const result = countTraits(cards, campaigns[id]);
console.log(`${campaigns[id].name}: ${result.cards} cards, ${result.copies} copies\n`);

if (args.includes('--pairs')) {
  const fixed = option('--with') ?? null;
  if (fixed && !result.traits.some((t) => t.trait === fixed)) {
    console.error(`Unknown trait "${fixed}" for this campaign.`);
    process.exit(1);
  }
  const pairs = rankPairs(result.traits, countOverlaps(cards, campaigns[id]), { fixed, limit: top });
  console.log(['Pair'.padEnd(28), 'Cover', 'Share', '  Both'].join('  '));
  for (const p of pairs) {
    const share = `${((p.coverage / result.copies) * 100).toFixed(1)}%`;
    console.log(
      [`${p.a} + ${p.b}`.padEnd(28), String(p.coverage).padStart(5), share.padStart(5), String(p.overlap).padStart(6)].join(
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
      String(t.total).padStart(5),
      `${(t.share * 100).toFixed(1)}%`.padStart(5),
      ...COUNTED_TYPES.map((type) => String(t.byType[type] || '').padStart(6)),
    ].join('  '),
  );
}
if (result.traits.length > top) console.log(`\n${result.traits.length - top} more traits (use --top N)`);

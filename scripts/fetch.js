// Downloads ArkhamDB card and pack data into data/cache/ (not committed).
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const CACHE_DIR = join(import.meta.dirname, '..', 'data', 'cache');
const SOURCES = {
  'api-public-packs.json': 'https://arkhamdb.com/api/public/packs/',
  'api-public-cards.json': 'https://arkhamdb.com/api/public/cards/?encounter=1',
};

await mkdir(CACHE_DIR, { recursive: true });

for (const [file, url] of Object.entries(SOURCES)) {
  const res = await fetch(url, { headers: { 'User-Agent': 'arkham-traits' } });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const text = await res.text();
  JSON.parse(text); // fail early on a broken download
  await writeFile(join(CACHE_DIR, file), text);
  console.log(`${file}: ${(text.length / 1e6).toFixed(1)} MB`);
}

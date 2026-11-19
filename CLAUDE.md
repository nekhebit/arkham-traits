# arkham-traits

Helps pick the two traits for the Grizzled skill card (Arkham Horror LCG)
by counting trait frequency on encounter cards per campaign.

## Data
- Source: ArkhamDB public API (`/api/public/cards/?encounter=1`, `/api/public/packs/`)
- Cached in `data/cache/` (not committed; download with the fetch script)
- Counted types: enemy, treachery, location, enemy_location
- Weight: `quantity` (copies per card)
- Two-sided cards (front has `linked_to_code`, back is the hidden linked card) count ½ × quantity per side, even when one side is an uncounted type (asset, act). The page shows this as a disclaimer
- `campaigns.json`: hand-written mapping of campaign -> packs (-> scenarios later)

## Content rules (copyright)
- Commit only derived data (trait names and counts), never the ArkhamDB dump
- No card text, flavor text or images in the repo or the web page
- Keep the tool non-commercial; credit ArkhamDB and Fantasy Flight Games

## Conventions
- Node.js, ES modules, no build step
- Commit messages: imperative subject, no co-author trailer
- Deploy: every push to main deploys docs/ via .github/workflows/pages.yml, which writes docs/version.json (short commit hash)
- Version: bump `version` in package.json for user-visible changes, then `npm run build` and commit docs/traits.json

## Working preferences
- Never use em dashes in text output, unless explicitly told to for that instance.
- Use SI units when communicating (measurements, sizes, etc.).
- Present a plan before doing any action, then wait for approval before proceeding.

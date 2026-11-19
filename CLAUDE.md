# arkham-traits

Helps pick the two traits for the Grizzled skill card (Arkham Horror LCG)
by counting trait frequency on encounter cards per campaign.

## Data
- Source: ArkhamDB public API (`/api/public/cards/?encounter=1`, `/api/public/packs/`)
- Cached in `data/cache/` (not committed; download with the fetch script)
- Counted types: enemy, treachery, location, enemy_location
- Includes hidden flip sides (you test against the side in play)
- Weight: `quantity` (copies per card)
- `campaigns.json`: hand-written mapping of campaign -> packs (-> scenarios later)

## Conventions
- Node.js, ES modules, no build step
- Commit messages: imperative subject, no co-author trailer

## Working preferences
- Never use em dashes in text output, unless explicitly told to for that instance.
- Use SI units when communicating (measurements, sizes, etc.).
- Present a plan before doing any action, then wait for approval before proceeding.

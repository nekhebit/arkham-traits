# arkham-traits

Helps pick the two traits for the Grizzled skill card (Arkham Horror LCG)
by counting trait frequency on encounter cards per campaign.

## Data
- Source: ArkhamDB public API (`/api/public/cards/?encounter=1`, `/api/public/packs/`)
- Cached in `data/cache/` (not committed; download with the fetch script)
- Counted types: enemy, treachery, location, enemy_location
- Weight: `quantity` (copies per card)
- Two-sided cards (front has `linked_to_code`, back is the hidden linked card) count ½ × quantity per side, even when one side is an uncounted type (asset, act). The page shows this as a disclaimer
- `campaigns.json`: campaign -> scenarios -> encounter sets (`encounter_code`). Scenario lists are based on ArkhamCards (zzorba/arkham-cards-data, no license): copy only set lists, never their files or text, and ask the user before adding another campaign
- A campaign with scenarios has two page modes: "expected per playthrough" (each scenario's sets x its `weight`, the chance it is played; default) and "each set once" (union of sets). Both include reused Core Set sets; `packs` is only the fallback for campaigns without scenarios
- Only scenarios with an encounter deck belong in `campaigns.json`. Hemlock Vale: the 4 town parts (prologue, both dawns, final evening) have none and are left out. 7 scenarios have weight 5/7 (6 of 8 played; 15 of 21 equally likely paths include each), the final one has 1
- Take only the ArkhamCards "gather_encounter_sets" list (the encounter deck), not separate story-asset steps like "gather_residents". Hemlock Vale: `residents` is only in Fate of the Vale
- Cards with several versions (same name, same set) count every version; known overcount, mentioned on the page
- Spoilers: the user avoids campaign story spoilers. Page text stays neutral, no story events or scenario roles
- Skill-test filter (`hasSkillTest` in src/count.js): enemies with fight/evade, locations with shroud, treacheries whose text has the word "test". Heuristic; reactive treacheries still count. traits.json has a `tested` copy of every view
- `npm run build` fails on unknown set codes, weights outside 0..1 and the reserved scenario ids `once` and `tested`

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

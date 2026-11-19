// Renders the trait and pair charts from traits.json (built by `npm run build`).
import data from './traits.json' with { type: 'json' };
import { rankPairs } from './pairs.js';

const TYPE_LABELS = {
  enemy: 'Enemy',
  treachery: 'Treachery',
  location: 'Location',
  enemy_location: 'Enemy-location',
};
const PAIR_ROWS = 10;
// Value label sits beside the bar; the longest bar leaves this much room for it.
const LABEL_ROOM = 40;

const $ = (id) => document.getElementById(id);
const el = (tag, props = {}, children = []) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
};

const types = data.types;
const typeColor = (type) => `var(--series-${types.indexOf(type) + 1})`;
const PAIR_PARTS = [
  { key: 'overlap', label: 'Both traits (4 wild icons)', color: 'var(--pair-both)' },
  { key: 'single', label: 'One trait (2 wild icons)', color: 'var(--pair-one)' },
];

// ---- Controls ---------------------------------------------------------------

// URL hash: #campaign[/scenario | /once][/tested]
const select = $('campaign');
const scenarioSelect = $('scenario');
const modeButtons = [...document.querySelectorAll('#mode button')];
let mode = 'expected';
const testedBox = $('tested');

const MODE_NOTES = {
  expected: [
    'Expected per playthrough.',
    "You don't play every scenario in one campaign. Each encounter set counts once per scenario that uses it, multiplied by the chance that you play that scenario. This assumes every valid path is equally likely. Your own path will differ.",
  ],
  once: [
    'Each set once.',
    'Every encounter set counts once, no matter how many scenarios use it. This shows which cards exist in the campaign, not how often you meet them.',
  ],
};

for (const [id, c] of Object.entries(data.campaigns)) select.append(el('option', { value: id, textContent: c.name }));
const [hashCampaign, ...hashFlags] = decodeURIComponent(location.hash.slice(1)).split('/');
if (data.campaigns[hashCampaign]) select.value = hashCampaign;
if (hashFlags.includes('once')) mode = 'once';
testedBox.checked = hashFlags.includes('tested');
fillScenarioSelect(hashFlags.find((f) => f !== 'once' && f !== 'tested'));

function fillScenarioSelect(keep = '') {
  const scenarios = data.campaigns[select.value].scenarios ?? {};
  scenarioSelect.replaceChildren(
    el('option', { value: '', textContent: 'Whole campaign' }),
    ...Object.entries(scenarios).map(([id, s]) => el('option', { value: id, textContent: s.name })),
  );
  scenarioSelect.value = scenarios[keep] ? keep : '';
  scenarioSelect.disabled = Object.keys(scenarios).length === 0;
}

function updateHash() {
  let hash = select.value;
  if (scenarioSelect.value) hash += `/${scenarioSelect.value}`;
  else if (mode === 'once') hash += '/once';
  if (testedBox.checked) hash += '/tested';
  history.replaceState(null, '', `#${hash}`);
}

// The mode only matters for a whole campaign that has scenarios.
function updateModeControls() {
  const campaign = data.campaigns[select.value];
  const show = !scenarioSelect.value && Object.keys(campaign.scenarios ?? {}).length > 0;
  $('mode-row').hidden = !show;
  $('mode-note').hidden = !show;
  const [lead, text] = MODE_NOTES[mode];
  $('mode-note').replaceChildren(el('strong', { textContent: lead }), ` ${text}`);
  for (const b of modeButtons) b.setAttribute('aria-pressed', String(b.dataset.mode === mode));
  $('tested-note').hidden = !testedBox.checked;
}

// The selected campaign or scenario: { copies, traits, overlaps },
// switched to its `tested` counts when the skill-test filter is on.
function currentView() {
  const campaign = data.campaigns[select.value];
  const scenario = campaign.scenarios?.[scenarioSelect.value];
  const base = scenario ?? campaign[mode];
  const tested = testedBox.checked;
  return {
    view: tested ? base.tested : base,
    title: scenario ? `${scenario.name} (${campaign.name})` : campaign.name,
    scope: [scenario ? scenario.name : MODE_NOTES[mode][0].replace(/\.$/, '').toLowerCase(), tested && 'skill tests only']
      .filter(Boolean)
      .join(' · '),
  };
}

select.addEventListener('change', () => {
  fillScenarioSelect();
  updateHash();
  render();
});
scenarioSelect.addEventListener('change', () => {
  updateHash();
  render();
});
for (const b of modeButtons) {
  b.addEventListener('click', () => {
    mode = b.dataset.mode;
    updateHash();
    render();
  });
}
testedBox.addEventListener('change', () => {
  updateHash();
  render();
});
$('fixed').addEventListener('change', () => renderPairs(currentView().view));

// Legends: fixed order, same colors for every campaign.
const legendItem = (color, label) => el('li', {}, [el('span', { className: 'swatch', style: `background:${color}` }), label]);
$('legend').append(...types.map((t) => legendItem(typeColor(t), TYPE_LABELS[t])));
$('pair-legend').append(...PAIR_PARTS.map((p) => legendItem(p.color, p.label)));

// ---- Shared pieces ----------------------------------------------------------

// Two-sided cards count half per side, so counts can end in .5.
const fmt = (n) => {
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
};
const pct = (n, campaign) => `${((n / campaign.copies) * 100).toFixed(1)}%`;

// parts: [{ value, color }]; ratio: bar length relative to the longest bar.
function barRow({ label, value, valueText, ratio, parts, ariaLabel, tip }) {
  const segs = parts
    .filter((p) => p.value)
    .map((p) => el('div', { className: 'seg', style: `flex:${p.value};background:${p.color}` }));
  const bar = el('div', { className: 'bar', style: `width:calc((100% - ${LABEL_ROOM}px) * ${ratio})` }, segs);
  const row = el('div', { className: 'row', tabIndex: 0, role: 'listitem' }, [
    el('span', { className: 'label', textContent: label, title: label }),
    el('div', { className: 'track' }, [bar, el('span', { className: 'value', textContent: valueText ?? fmt(value) })]),
  ]);
  row.setAttribute('aria-label', ariaLabel);
  const show = () => showTip(row, tip);
  row.addEventListener('pointerenter', show);
  row.addEventListener('focus', show);
  row.addEventListener('pointerleave', hideTip);
  row.addEventListener('blur', hideTip);
  return row;
}

// tip: { title, lines: [{ color, label, value }] }
function showTip(row, { title, lines }) {
  const tip = $('tooltip');
  tip.replaceChildren(
    el('strong', { textContent: title }),
    ...lines.map((l) =>
      el('div', { className: 'line' }, [
        el('span', { className: 'swatch', style: `background:${l.color}` }),
        el('span', { textContent: l.label }),
        el('span', { textContent: fmt(l.value) }),
      ]),
    ),
  );
  tip.hidden = false;
  // Position relative to <main>, the tooltip's offset parent.
  const box = row.getBoundingClientRect();
  const host = tip.offsetParent.getBoundingClientRect();
  const left = box.left - host.left + row.querySelector('.track').offsetLeft + 8;
  tip.style.top = `${box.bottom - host.top + 4}px`;
  tip.style.left = `${Math.max(0, Math.min(left, host.width - tip.offsetWidth))}px`;
}

function hideTip() {
  $('tooltip').hidden = true;
}

function table(target, headers, rows) {
  $(target).replaceChildren(
    el('thead', {}, [el('tr', {}, headers.map((h) => el('th', { textContent: h })))]),
    el('tbody', {}, rows.map((r) => el('tr', {}, r.map((v) => el('td', { textContent: typeof v === 'number' ? fmt(v) : v }))))),
  );
}

// ---- Trait chart ------------------------------------------------------------

function renderTraits(campaign, title) {
  const max = Math.max(...campaign.traits.map((t) => t.total));
  $('chart-title').textContent = `${title}: ${fmt(campaign.copies)} encounter copies`;

  $('chart').replaceChildren(
    ...campaign.traits.map((t) => {
      const present = types.filter((type) => t.byType[type]);
      return barRow({
        label: t.trait,
        value: t.total,
        ratio: t.total / max,
        parts: types.map((type) => ({ value: t.byType[type], color: typeColor(type) })),
        ariaLabel: `${t.trait}: ${fmt(t.total)} copies, ${pct(t.total, campaign)} of encounter cards. ${present
          .map((type) => `${TYPE_LABELS[type]} ${fmt(t.byType[type])}`)
          .join(', ')}`,
        tip: {
          title: `${t.trait}: ${fmt(t.total)} (${pct(t.total, campaign)})`,
          lines: present.map((type) => ({ color: typeColor(type), label: TYPE_LABELS[type], value: t.byType[type] })),
        },
      });
    }),
  );

  table(
    'table',
    ['Trait', 'Total', 'Share', ...types.map((type) => TYPE_LABELS[type])],
    campaign.traits.map((t) => [t.trait, t.total, pct(t.total, campaign), ...types.map((type) => t.byType[type] || '')]),
  );
}

// ---- Pair chart -------------------------------------------------------------

function fillFixedSelect(campaign) {
  const fixed = $('fixed');
  const keep = fixed.value;
  fixed.replaceChildren(
    el('option', { value: '', textContent: 'Any' }),
    ...campaign.traits.map((t) => el('option', { value: t.trait, textContent: `${t.trait} (${fmt(t.total)})` })),
  );
  fixed.value = campaign.traits.some((t) => t.trait === keep) ? keep : '';
}

function renderPairs(campaign) {
  const fixed = $('fixed').value || null;
  const pairs = rankPairs(campaign.traits, campaign.overlaps, { fixed, limit: PAIR_ROWS });
  const max = pairs[0]?.coverage || 1;

  $('pairs').replaceChildren(
    ...pairs.map((p) => {
      const name = `${p.a} + ${p.b}`;
      const single = p.onlyA + p.onlyB;
      return barRow({
        label: name,
        value: p.coverage,
        ratio: p.coverage / max,
        parts: [
          { value: p.overlap, color: PAIR_PARTS[0].color },
          { value: single, color: PAIR_PARTS[1].color },
        ],
        ariaLabel: `${name}: helps on ${fmt(p.coverage)} copies, ${pct(p.coverage, campaign)}. Both traits on ${fmt(p.overlap)}.`,
        tip: {
          title: `${name}: ${fmt(p.coverage)} (${pct(p.coverage, campaign)})`,
          lines: [
            { color: PAIR_PARTS[0].color, label: 'Both traits', value: p.overlap },
            { color: PAIR_PARTS[1].color, label: `Only ${p.a}`, value: p.onlyA },
            { color: PAIR_PARTS[1].color, label: `Only ${p.b}`, value: p.onlyB },
          ],
        },
      });
    }),
  );

  table(
    'pair-table',
    ['Pair', 'Coverage', 'Share', 'Both', `Only first`, `Only second`],
    pairs.map((p) => [`${p.a} + ${p.b}`, p.coverage, pct(p.coverage, campaign), p.overlap, p.onlyA, p.onlyB]),
  );
}

// ---- Best sets (upgraded Grizzled) ------------------------------------------

const RANKINGS = {
  total: 'Most copies in total. Large scenarios count more.',
  avg: 'Best average share per scenario, weighted by the chance to play each scenario. Every scenario counts, however big its deck.',
  worst: 'Best share in the weakest scenario, so no scenario leaves Grizzled without a target.',
};
let ranking = 'total';
const rankButtons = [...document.querySelectorAll('#ranking button')];
for (const b of rankButtons) {
  b.addEventListener('click', () => {
    ranking = b.dataset.ranking;
    render();
  });
}
const pctText = (x) => `${Math.round(x * 100)}%`;

// Spread data for the current campaign and filter, or null (single scenario).
function currentSpread() {
  const campaign = data.campaigns[select.value];
  if (scenarioSelect.value || !campaign.spread) return null;
  return { scenarios: campaign.spread.scenarios, ...campaign.spread[testedBox.checked ? 'tested' : 'all'] };
}

function renderUpgrades(campaign) {
  const spread = currentSpread();
  if (!spread && ranking !== 'total') ranking = 'total';
  $('ranking-row').hidden = !spread;
  for (const b of rankButtons) b.setAttribute('aria-pressed', String(b.dataset.ranking === ranking));
  $('ranking-note').textContent = RANKINGS[ranking];

  // Normalise both shapes to { traits, value, text, lines }.
  let sets;
  if (ranking === 'total') {
    const pick = (p) => ({
      traits: p.traits,
      value: p.coverage,
      text: fmt(p.coverage),
      title: `${p.traits.length} traits: ${fmt(p.coverage)} (${pct(p.coverage, campaign)})`,
      lines: p.traits.map((t) => ({ color: 'var(--pair-both)', label: t, value: fmt(campaign.traits.find((x) => x.trait === t)?.total ?? 0) })),
    });
    sets = { path: campaign.upgrades.path.map(pick), best4: campaign.upgrades.best4.map(pick) };
  } else {
    const label = ranking === 'avg' ? 'average' : 'worst scenario';
    const pick = (p) => ({
      traits: p.traits,
      value: p.score,
      text: pctText(p.score),
      title: `${p.traits.length} traits: ${pctText(p.score)} ${label}`,
      lines: spread.scenarios.map((sc, i) => ({ color: 'var(--pair-both)', label: sc.name, value: pctText(p.shares[i]) })),
    });
    sets = { path: spread[ranking].path.map(pick), best4: spread[ranking].best4.map(pick) };
  }

  const max = Math.max(1e-9, ...sets.path.map((p) => p.value), ...sets.best4.map((p) => p.value));
  const rows = (list) =>
    list.map((p) => {
      const name = p.traits.join(' + ');
      return barRow({
        label: name,
        value: p.value,
        valueText: p.text,
        ratio: p.value / max,
        parts: [{ value: p.value, color: 'var(--pair-both)' }],
        ariaLabel: `${name}: ${p.title}.`,
        tip: { title: p.title, lines: p.lines },
      });
    });
  $('path').replaceChildren(...rows(sets.path));
  $('best4').replaceChildren(...rows(sets.best4));
}

// ---- Spread heatmap ----------------------------------------------------------

const SPREAD_ROWS = 10;
const shortName = (name) => name.replace(/^The /, '').replace(/ \(.*\)$/, '');

function renderSpread() {
  const spread = currentSpread();
  $('spread-card').hidden = !spread;
  if (!spread) return;
  const rows = spread.traits.slice(0, SPREAD_ROWS);
  const max = Math.max(1e-9, ...rows.flatMap((r) => r.shares));
  const cell = (share) => {
    const strength = share / max;
    const td = el('td', { className: 'heat', textContent: share ? pctText(share) : '–' });
    if (share) {
      td.style.background = `color-mix(in srgb, var(--heat) ${Math.round(strength * 85)}%, var(--surface))`;
      if (strength > 0.55) td.classList.add('strong');
    }
    return td;
  };
  $('spread-table').replaceChildren(
    el('thead', {}, [
      el('tr', {}, [
        el('th', { textContent: 'Trait' }),
        ...spread.scenarios.map((sc) => el('th', { textContent: shortName(sc.name), title: sc.name })),
        el('th', { textContent: 'In', title: 'Scenarios with this trait' }),
        el('th', { textContent: 'Avg' }),
        el('th', { textContent: 'Worst' }),
      ]),
    ]),
    el(
      'tbody',
      {},
      rows.map((r) =>
        el('tr', {}, [
          el('td', { textContent: r.trait }),
          ...r.shares.map(cell),
          el('td', { textContent: `${r.shares.filter(Boolean).length}/${r.shares.length}` }),
          el('td', { textContent: pctText(r.avg) }),
          el('td', { textContent: pctText(r.worst) }),
        ]),
      ),
    ),
  );
}

// ---- Render -----------------------------------------------------------------

function render() {
  updateModeControls();
  const { view, title, scope } = currentView();
  renderTraits(view, title);
  $('pairs-title').textContent = `Best pairs · ${scope}`;
  $('sets-title').textContent = `Best sets for an upgraded Grizzled · ${scope}`;
  fillFixedSelect(view);
  renderPairs(view);
  renderUpgrades(view);
  renderSpread();
}

render();

// ---- Version ----------------------------------------------------------------
// version.json only exists on the deployed site (written by the Pages workflow).

async function renderVersion() {
  const target = $('version');
  let commit = null;
  try {
    const res = await fetch('version.json', { cache: 'no-store' });
    if (res.ok) commit = (await res.json()).commit;
  } catch {
    // Local preview: no deploy info.
  }
  target.append(`v${data.version} · `);
  if (commit) {
    target.append(el('a', { href: `https://github.com/nekhebit/arkham-traits/commit/${commit}`, textContent: commit }));
  } else {
    target.append('local');
  }
  target.append(` · card data ${data.dataDate}`);
}

renderVersion();

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

// URL hash: #campaign or #campaign/scenario
const select = $('campaign');
const scenarioSelect = $('scenario');
for (const [id, c] of Object.entries(data.campaigns)) select.append(el('option', { value: id, textContent: c.name }));
const [hashCampaign, hashScenario] = decodeURIComponent(location.hash.slice(1)).split('/');
if (data.campaigns[hashCampaign]) select.value = hashCampaign;
fillScenarioSelect(hashScenario);

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
  const hash = scenarioSelect.value ? `${select.value}/${scenarioSelect.value}` : select.value;
  history.replaceState(null, '', `#${hash}`);
}

// The selected campaign or scenario: { copies, traits, overlaps }.
function currentView() {
  const campaign = data.campaigns[select.value];
  const scenario = campaign.scenarios?.[scenarioSelect.value];
  return {
    view: scenario ?? campaign,
    title: scenario ? `${scenario.name} (${campaign.name})` : campaign.name,
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
$('fixed').addEventListener('change', () => renderPairs(currentView().view));

// Legends: fixed order, same colors for every campaign.
const legendItem = (color, label) => el('li', {}, [el('span', { className: 'swatch', style: `background:${color}` }), label]);
$('legend').append(...types.map((t) => legendItem(typeColor(t), TYPE_LABELS[t])));
$('pair-legend').append(...PAIR_PARTS.map((p) => legendItem(p.color, p.label)));

// ---- Shared pieces ----------------------------------------------------------

// Two-sided cards count half per side, so counts can end in .5.
const fmt = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
const pct = (n, campaign) => `${((n / campaign.copies) * 100).toFixed(1)}%`;

// parts: [{ value, color }]; ratio: bar length relative to the longest bar.
function barRow({ label, value, ratio, parts, ariaLabel, tip }) {
  const segs = parts
    .filter((p) => p.value)
    .map((p) => el('div', { className: 'seg', style: `flex:${p.value};background:${p.color}` }));
  const bar = el('div', { className: 'bar', style: `width:calc((100% - ${LABEL_ROOM}px) * ${ratio})` }, segs);
  const row = el('div', { className: 'row', tabIndex: 0, role: 'listitem' }, [
    el('span', { className: 'label', textContent: label, title: label }),
    el('div', { className: 'track' }, [bar, el('span', { className: 'value', textContent: fmt(value) })]),
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

// ---- Render -----------------------------------------------------------------

function render() {
  const { view, title } = currentView();
  renderTraits(view, title);
  fillFixedSelect(view);
  renderPairs(view);
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

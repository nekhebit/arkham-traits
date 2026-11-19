// Renders the trait chart from traits.json (built by `npm run build`).
import data from './traits.json' with { type: 'json' };

const TYPE_LABELS = {
  enemy: 'Enemy',
  treachery: 'Treachery',
  location: 'Location',
  enemy_location: 'Enemy-location',
};

const $ = (id) => document.getElementById(id);
const el = (tag, props = {}, children = []) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
};

const types = data.types;
const color = (type) => `var(--series-${types.indexOf(type) + 1})`;

const select = $('campaign');
for (const [id, c] of Object.entries(data.campaigns)) select.append(el('option', { value: id, textContent: c.name }));
const fromHash = location.hash.slice(1);
if (data.campaigns[fromHash]) select.value = fromHash;
select.addEventListener('change', () => {
  history.replaceState(null, '', `#${select.value}`);
  render();
});

// Legend: fixed order, the same colors for every campaign.
$('legend').append(
  ...types.map((t) => el('li', {}, [el('span', { className: 'swatch', style: `background:${color(t)}` }), TYPE_LABELS[t]])),
);

function render() {
  const campaign = data.campaigns[select.value];
  const max = Math.max(...campaign.traits.map((t) => t.total));
  $('chart-title').textContent = `${campaign.name}: ${campaign.cards} cards, ${campaign.copies} copies`;

  $('chart').replaceChildren(
    ...campaign.traits.map((t) => {
      const segs = types
        .filter((type) => t.byType[type])
        .map((type) => el('div', { className: 'seg', style: `flex:${t.byType[type]};background:${color(type)}` }));
      // Scale against the track minus 40px, so the longest bar still leaves room for its value label.
      const bar = el('div', { className: 'bar', style: `width:calc((100% - 40px) * ${t.total / max})` }, segs);
      const row = el('div', { className: 'row', tabIndex: 0, role: 'listitem' }, [
        el('span', { className: 'trait', textContent: t.trait, title: t.trait }),
        el('div', { className: 'track' }, [bar, el('span', { className: 'value', textContent: t.total })]),
      ]);
      row.setAttribute('aria-label', describe(t, campaign));
      row.addEventListener('pointerenter', () => showTip(row, t, campaign));
      row.addEventListener('focus', () => showTip(row, t, campaign));
      row.addEventListener('pointerleave', hideTip);
      row.addEventListener('blur', hideTip);
      return row;
    }),
  );

  renderTable(campaign);
}

function pct(n, campaign) {
  return `${((n / campaign.copies) * 100).toFixed(1)}%`;
}

function describe(t, campaign) {
  const parts = types.filter((type) => t.byType[type]).map((type) => `${TYPE_LABELS[type]} ${t.byType[type]}`);
  return `${t.trait}: ${t.total} copies, ${pct(t.total, campaign)} of encounter cards. ${parts.join(', ')}`;
}

function showTip(row, t, campaign) {
  const tip = $('tooltip');
  tip.replaceChildren(
    el('strong', { textContent: `${t.trait}: ${t.total} (${pct(t.total, campaign)})` }),
    ...types
      .filter((type) => t.byType[type])
      .map((type) =>
        el('div', { className: 'line' }, [
          el('span', { className: 'swatch', style: `background:${color(type)}` }),
          el('span', { textContent: TYPE_LABELS[type] }),
          el('span', { textContent: t.byType[type] }),
        ]),
      ),
  );
  tip.hidden = false;
  const chart = $('chart');
  const top = row.offsetTop + row.offsetHeight + 4;
  const left = Math.min(row.querySelector('.track').offsetLeft + 8, chart.clientWidth - tip.offsetWidth);
  tip.style.top = `${top + chart.offsetTop}px`;
  tip.style.left = `${Math.max(0, left) + chart.offsetLeft}px`;
}

function hideTip() {
  $('tooltip').hidden = true;
}

function renderTable(campaign) {
  const head = el('tr', {}, [
    el('th', { textContent: 'Trait' }),
    el('th', { textContent: 'Total' }),
    el('th', { textContent: 'Share' }),
    ...types.map((type) => el('th', { textContent: TYPE_LABELS[type] })),
  ]);
  const rows = campaign.traits.map((t) =>
    el('tr', {}, [
      el('td', { textContent: t.trait }),
      el('td', { textContent: t.total }),
      el('td', { textContent: pct(t.total, campaign) }),
      ...types.map((type) => el('td', { textContent: t.byType[type] || '' })),
    ]),
  );
  $('table').replaceChildren(el('thead', {}, [head]), el('tbody', {}, rows));
}

render();

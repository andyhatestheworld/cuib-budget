// views/rule.js - regula 50-30-20 calculata real din categoriile cheltuielilor
import { h, svgFromString } from '../lib/dom.js';
import { meter } from '../components/ui.js';
import { formatMoney, formatNumber, formatPercent } from '../core/format.js';
import { computeBudget } from '../core/budget.js';
import { t } from '../i18n.js';

const BUCKETS = [
  { key: 'needs',   variant: 'need',    pct: '50%', goodWhenUnder: true },
  { key: 'wants',   variant: 'want',    pct: '30%', goodWhenUnder: true },
  { key: 'savings', variant: 'savings', pct: '20%', goodWhenUnder: false },
];

export function rule(state) {
  const b = computeBudget(state);
  const cur = state.currency;

  const met = BUCKETS.filter((bk) => isOk(bk, b.rule[bk.key])).length;

  return h('section', { class: 'screen' },
    h('header', { class: 'screen-head screen-head--center' },
      h('h1', { class: 'screen-title' }, t.rule.title),
      h('p', { class: 'screen-sub' }, t.rule.sub),
    ),

    summaryCard(b, cur, met),

    h('ul', { class: 'stack stack--lg' },
      ...BUCKETS.map((bk) => ruleCard(bk, b.rule[bk.key], cur, b.income)),
    ),

    h('p', { class: 'hint' }, t.rule.hint),
  );
}

/* ---------- Card de sumar: donut live + legenda ---------- */
function summaryCard(b, cur, met) {
  const verdict = b.income > 0 ? t.rule.verdict(met) : t.rule.verdictNoIncome;

  return h('div', { class: 'card rule-summary' },
    h('div', { class: 'donut-wrap' }, donut(b)),
    h('div', { class: 'rule-legend' },
      legendItem('need', t.catPlural.need, b.needs, b.income, cur),
      legendItem('want', t.catPlural.want, b.wants, b.income, cur),
      legendItem('savings', t.catPlural.save, b.saved, b.income, cur),
      legendItem('left', t.rule.legendLeft, Math.max(0, b.unallocated), b.income, cur),
      h('div', { class: `rule-verdict ${met === 3 && b.income > 0 ? 'is-good' : ''}` }, verdict),
    ),
  );
}

function legendItem(variant, name, value, income, cur) {
  const share = income > 0 ? value / income : 0;
  return h('div', { class: 'rl-item' },
    h('span', { class: `rl-dot rl-dot--${variant}` }),
    h('span', { class: 'rl-name' }, name),
    h('span', { class: 'rl-pct' }, formatPercent(share)),
    h('span', { class: 'rl-val' }, formatMoney(value, cur)),
  );
}

// Donut care reflecta impartirea REALA a venitului (nu doar referinta 50-30-20).
function donut(b) {
  const r = 68, cx = 90, cy = 90, stroke = 22;
  const circ = 2 * Math.PI * r;
  const base = Math.max(b.income, b.totalOut, 1);

  const segs = [
    { val: b.needs, cls: 'seg-need' },
    { val: b.wants, cls: 'seg-want' },
    { val: b.saved, cls: 'seg-savings' },
    { val: Math.max(0, b.unallocated), cls: 'seg-left' },
  ].filter((s) => s.val > 0);

  const track = `<circle class="donut-track" cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke-width="${stroke}" />`;

  let offset = 0;
  const arcs = (b.income > 0 ? segs : []).map((s) => {
    const len = (s.val / base) * circ;
    const el = `<circle class="${s.cls}" cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke-width="${stroke}" stroke-dasharray="${len} ${circ - len}" stroke-dashoffset="${-offset}" transform="rotate(-90 ${cx} ${cy})" stroke-linecap="butt" />`;
    offset += len;
    return el;
  }).join('');

  const big = b.income > 0 ? formatPercent(b.savingsRate) : '—';
  const sub = b.income > 0 ? t.rule.donutSaved : t.rule.donutNoIncome;

  return svgFromString(`
    <svg class="donut" viewBox="0 0 180 180" width="168" height="168" role="img" aria-label="${t.rule.donutAria}">
      ${track}
      ${arcs}
      <text x="90" y="88" text-anchor="middle" class="donut-title">${big}</text>
      <text x="90" y="107" text-anchor="middle" class="donut-sub">${sub}</text>
    </svg>
  `);
}

/* ---------- Card per categorie ---------- */
function isOk(bucket, data) {
  return bucket.goodWhenUnder
    ? data.actual <= data.target + 1
    : data.actual >= data.target - 1;
}

function ruleCard(bucket, data, cur, income) {
  const { key, variant, pct, goodWhenUnder } = bucket;
  const { name, desc } = t.rule.buckets[key];
  const ok = isOk(bucket, data);
  const gap = Math.round(Math.abs(data.actual - data.target));

  let status;
  if (income === 0) {
    status = t.rule.statusNoIncome;
  } else if (goodWhenUnder) {
    status = ok ? t.rule.statusUnder(formatMoney(gap, cur)) : t.rule.statusOver(formatMoney(gap, cur));
  } else {
    status = ok ? t.rule.statusSaveOk(formatMoney(gap, cur)) : t.rule.statusSaveUnder(formatMoney(gap, cur));
  }

  const over = goodWhenUnder && !ok; // depaseste pragul recomandat
  const meterVariant = over ? 'over' : variant;

  return h('li', { class: `rule-card rule-card--${variant}` },
    h('div', { class: 'rule-top' },
      h('span', { class: 'rule-pct' }, pct),
      h('div', { class: 'rule-body' },
        h('span', { class: 'rule-name' }, name),
        h('span', { class: 'rule-desc' }, desc),
      ),
      h('div', { class: 'rule-figures' },
        h('span', { class: 'rule-actual' }, formatMoney(data.actual, cur)),
        h('span', { class: 'rule-target' }, t.rule.target(income > 0 ? formatPercent(data.share) : '0%', formatNumber(data.target))),
      ),
    ),
    meter(data.fill, meterVariant),
    income > 0
      ? h('div', { class: `rule-status rule-status--${ok ? 'ok' : 'warn'}` }, (ok ? '✓ ' : '! ') + status)
      : h('div', { class: 'rule-status' }, status),
  );
}

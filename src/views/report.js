// views/report.js
// Raport curat, gata de distribuit: se construieste un document simplu (titlu = luna,
// venituri, cheltuieli, impartire, 50-30-20) si se deschide fereastra de printare, de
// unde userul salveaza ca PDF sau imagine. Raportul e ascuns pe ecran (`.report-page`
// e display:none) si apare doar la printare (vezi @media print in styles.css).

import { h } from '../lib/dom.js';
import { computeBudget, paymentSplit, expenseAmount, expenseOwnerId } from '../core/budget.js';
import { formatMoney, formatPercent } from '../core/format.js';
import { t } from '../i18n.js';

export function saveReport(state) {
  const node = buildReport(state);
  document.body.appendChild(node);
  // Numele implicit al PDF-ului salvat vine din document.title: il setam pe durata printarii.
  const prevTitle = document.title;
  document.title = `${t.appName} - ${t.report.title(state.month)}`;
  const cleanup = () => {
    node.remove();
    document.title = prevTitle;
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);
  // Lasa DOM-ul sa se aseze inainte de a deschide dialogul de printare.
  setTimeout(() => window.print(), 60);
}

function buildReport(state) {
  const b = computeBudget(state);
  const cur = state.currency;
  const multi = state.people.length > 1;
  const split = multi ? paymentSplit(state) : [];

  return h('div', { class: 'report-page' },
    h('div', { class: 'report' },
      h('header', { class: 'report-head' },
        h('h1', { class: 'report-title' }, t.report.title(state.month)),
        h('div', { class: 'report-total' },
          h('span', { class: 'report-total-label' }, t.report.incomeLabel),
          h('span', { class: 'report-total-val' }, formatMoney(b.income, cur)),
        ),
      ),

      multi ? section(t.report.peopleLabel,
        state.people.map((p) => reportLine(
          h('span', null, h('span', { class: 'report-swatch', style: { background: p.color } }), p.name),
          formatMoney(p.amount, cur),
        )),
      ) : null,

      expensesSection(state, cur, multi),

      multi ? section(t.report.splitLabel, [
        ...split.map((s) => reportLine(
          h('span', null, h('span', { class: 'report-swatch', style: { background: s.color } }), `${s.name} · ${formatPercent(b.income ? s.total / (split.reduce((x, y) => x + y.total, 0) || 1) : 0)}`),
          formatMoney(s.total, cur),
        )),
        ...split.filter((s) => s.over > 0).map((s) => h('div', { class: 'report-warn' }, t.home.splitWarn(s.name, formatMoney(s.over, cur)))),
      ]) : null,

      reportLine(
        h('strong', null, b.unallocated < 0 ? t.report.overLabel : t.report.leftLabel),
        h('strong', null, formatMoney(b.unallocated, cur)),
        'report-line--total',
      ),

      section(t.report.ruleLabel, [
        ruleRow(t.catPlural.need, b.rule.needs, cur, true, b.income),
        ruleRow(t.catPlural.want, b.rule.wants, cur, true, b.income),
        ruleRow(t.catPlural.save, b.rule.savings, cur, false, b.income),
      ]),

      h('footer', { class: 'report-foot' }, t.report.generated(new Date().toLocaleDateString('ro-RO'))),
    ),
  );
}

function section(title, rows) {
  return h('section', { class: 'report-section' },
    h('h2', { class: 'report-section-title' }, title),
    ...rows,
  );
}

// Cheltuielile grupate pe categorii: fiecare categorie cu subtotal, apoi cheltuielile ei.
function expensesSection(state, cur, multi) {
  const people = state.people;
  const groups = ['need', 'want', 'save']
    .map((cat) => ({ cat, items: state.expenses.filter((e) => e.category === cat) }))
    .filter((g) => g.items.length);

  if (!groups.length) {
    return section(t.report.expensesLabel, [h('div', { class: 'report-empty' }, t.report.noExpenses)]);
  }

  return h('section', { class: 'report-section' },
    h('h2', { class: 'report-section-title' }, t.report.expensesLabel),
    ...groups.map((g) => h('div', { class: 'report-group' },
      h('div', { class: 'report-group-head' },
        h('span', null, t.catPlural[g.cat]),
        h('span', { class: 'report-group-sum' }, formatMoney(g.items.reduce((s, e) => s + expenseAmount(e), 0), cur)),
      ),
      ...g.items.map((e) => expenseRows(e, cur, multi, people)),
    )),
  );
}

// Bulina de proprietar: culoarea persoanei atribuite, sau neutra (comun / general).
function ownerDot(personId, people) {
  const owner = people.find((p) => p.id === personId);
  return owner
    ? h('span', { class: 'report-swatch', style: { background: owner.color } })
    : h('span', { class: 'report-swatch report-swatch--common' });
}

// O cheltuiala in raport: linia ei, plus partile (sub-cheltuielile) dedesubt daca are.
// In mod multi-persoana, fiecare linie primeste bulina de proprietar (comun / culoare).
function expenseRows(e, cur, multi, people) {
  const hasParts = Array.isArray(e.items) && e.items.length;
  const parent = reportLine(
    h('span', null,
      multi ? ownerDot(expenseOwnerId(e), people) : null,
      `${e.icon || ''} ${e.name}`.trim(),
    ),
    formatMoney(expenseAmount(e), cur),
  );
  const parts = hasParts
    ? e.items.map((it) => reportLine(
        multi
          ? h('span', null, ownerDot(it.personId, people), it.name)
          : h('span', { class: 'report-part-name' }, it.name),
        formatMoney(Number(it.amount) || 0, cur),
        'report-line--part',
      ))
    : [];
  return h('div', { class: 'report-expense' }, parent, ...parts);
}

function reportLine(left, right, extra = '') {
  return h('div', { class: `report-line ${extra}`.trim() },
    h('span', { class: 'report-line-left' }, left),
    h('span', { class: 'report-line-right' }, right),
  );
}

function ruleRow(name, data, cur, goodWhenUnder, income) {
  const pct = data.target > 0 ? formatPercent(Math.min(data.actual / data.target, 1)) : '0%';
  const ok = goodWhenUnder ? data.actual <= data.target + 1 : data.actual >= data.target - 1;
  const gap = formatMoney(Math.round(Math.abs(data.actual - data.target)), cur);
  let status = '';
  if (income > 0) {
    if (goodWhenUnder) status = ok ? t.rule.statusUnder(gap) : t.rule.statusOver(gap);
    else status = ok ? t.rule.statusSaveOk(gap) : t.rule.statusSaveUnder(gap);
  }
  return h('div', { class: 'report-rule-row' },
    h('div', { class: 'report-rule-head' },
      h('span', null, name),
      h('span', { class: 'report-rule-fig' },
        `${formatMoney(data.actual, cur)} · `,
        h('strong', null, t.report.ruleTarget(formatMoney(data.target, cur))),
      ),
    ),
    h('div', { class: 'report-bar' }, h('div', { class: `report-bar-fill ${goodWhenUnder && !ok ? 'report-bar-fill--over' : ''}`.trim(), style: { width: pct } })),
    status ? h('div', { class: `report-rule-status ${ok ? 'is-ok' : 'is-warn'}` }, (ok ? '✓ ' : '! ') + status) : null,
  );
}

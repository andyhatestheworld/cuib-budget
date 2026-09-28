// views/home.js - ecranul Acasa: venit, impartire proportionala, cheltuieli detaliabile
import { h, fragment, svgFromString } from '../lib/dom.js';
import { requestRender } from '../lib/render-bus.js';
import { confirmDialog } from '../lib/dialog.js';
import { money, numberInput, eyebrow } from '../components/ui.js';
import { formatMoney, formatNumber, formatPercent, evalExpression } from '../core/format.js';
import { computeBudget, paymentSplit, expenseAmount, expenseOwnerId } from '../core/budget.js';
import { EMOJIS } from '../data/emojis.js';
import { t } from '../i18n.js';
import * as actions from '../state/store.js';

const CAT_LABEL = t.cat;
const CAT_CYCLE = ['need', 'want', 'save'];
const CURRENCIES = ['RON', 'EUR', 'USD', 'GBP', 'CHF'];

// Stare de interfata efemera (nu se salveaza): randuri deschise, ce selector e deschis.
const expanded = new Set();
const editing = new Set();   // ce cheltuieli au deschisa zona de editare (nume/tip)
const pendingOwner = {};     // { [expenseId]: personId } - proprietar pre-selectat pt partea noua
const subDraft = {};         // { [expenseId]: {name, amount} } - ciorna randului de adaugare parte
let openPicker = null; // emoji picker (id cheltuiala)
let openOwner = null;  // { expenseId, itemId } | null (itemId null = cheltuiala insasi, '__new__' = parte noua)
let openMenu = null;   // id cheltuiala pt meniul de actiuni (muta / duplica / sterge)

// Esc inchide orice popup deschis (o singura data, la nivel de document).
if (typeof document !== 'undefined') {
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && (openPicker || openOwner || openMenu)) {
      openPicker = null;
      openOwner = null;
      openMenu = null;
      requestRender();
    }
  });
}

function toggleMenu(id) {
  openMenu = openMenu === id ? null : id;
  requestRender();
}
function closeMenu() {
  openMenu = null;
  requestRender();
}

// Suma dintr-un input de compunere: accepta si expresii ("50+30"); negativul/invalidul -> 0.
function draftAmount(str) {
  const n = evalExpression(str);
  return Number.isNaN(n) ? 0 : Math.max(0, n);
}

function toggleExpand(id) {
  if (expanded.has(id)) { expanded.delete(id); editing.delete(id); delete pendingOwner[id]; delete subDraft[id]; }
  else expanded.add(id);
  requestRender();
}
function toggleEditing(id) {
  editing.has(id) ? editing.delete(id) : editing.add(id);
  requestRender();
}
function togglePicker(id) {
  openPicker = openPicker === id ? null : id;
  requestRender();
}
function pickEmoji(id, emoji) {
  openPicker = null;
  actions.setExpenseIcon(id, emoji); // declanseaza re-randarea prin store
}
function toggleOwner(expenseId, itemId = null) {
  const same = openOwner && openOwner.expenseId === expenseId && openOwner.itemId === itemId;
  openOwner = same ? null : { expenseId, itemId };
  requestRender();
}
function closeOwner() {
  openOwner = null;
  requestRender();
}
function pickOwner(expenseId, itemId, personId) {
  openOwner = null;
  if (itemId === '__new__') { pendingOwner[expenseId] = personId || null; requestRender(); return; }
  if (itemId) actions.setSubItemOwner(expenseId, itemId, personId);
  else actions.setExpenseOwner(expenseId, personId);
}

export function home(state) {
  const b = computeBudget(state);
  const split = paymentSplit(state);
  const cur = state.currency;

  const multi = state.people.length > 1;

  return h('section', { class: 'screen' },
    monthRow(state),
    incomeHero(state, b),
    multi ? splitCard(split, cur) : null,

    h('div', { class: 'section-head' },
      h('h2', { class: 'section-title' }, t.home.sectionExpenses),
      h('span', { class: 'section-meta' }, formatMoney(b.totalOut, cur)),
    ),
    h('ul', { class: 'stack' },
      state.expenses.length
        ? state.expenses.map((e) => expenseRow(e, cur, state.people))
        : h('li', { class: 'empty' }, t.home.empty),
    ),
    addExpenseCard(),

    breakdown(b, cur),
    allocationCard(b, cur),

    // Popup-urile (emoji / proprietar) se randeaza la nivelul ecranului, NU in interiorul
    // randului: altfel backdrop-filter-ul de sticla al randului le prinde in contextul lui
    // de stivuire si randurile de dedesubt le acopera.
    pickerLayer(state),
  );
}

/* ---------- Venit ---------- */
function monthRow(state) {
  return h('div', { class: 'month-row' },
    eyebrow(t.home.monthEyebrow),
    h('div', { class: 'month-line' },
      h('input', { class: 'month-input', value: state.month, 'aria-label': t.home.monthAria,
        onChange: (e) => actions.setMonth(e.target.value) }),
      currencySelect(state),
    ),
  );
}

function currencySelect(state) {
  const options = CURRENCIES.includes(state.currency) ? CURRENCIES : [state.currency, ...CURRENCIES];
  return h('select', {
    class: 'currency-select', 'aria-label': t.home.currencyAria,
    onChange: (e) => actions.setCurrency(e.target.value),
  }, ...options.map((c) => h('option', { value: c, selected: c === state.currency }, c)));
}

function incomeHero(state, b) {
  const canRemove = state.people.length > 1;
  return h('div', { class: 'card hero' },
    h('span', { class: 'hero-label' }, t.home.heroLabel),
    money(b.income, state.currency, { big: true }),
    h('div', { class: 'people' },
      ...state.people.map((p) => personBox(p, state.currency, canRemove)),
      addPersonBox(),
    ),
  );
}

function personBox(p, currency, canRemove) {
  const swatch = h('button', {
    class: 'swatch', type: 'button', title: t.home.colorTitle, style: { background: p.color },
    onClick: () => actions.cyclePersonColor(p.id),
  });
  return h('div', { class: 'person' },
    swatch,
    h('input', { class: 'person-name', value: p.name, 'aria-label': t.home.personNameAria,
      onChange: (e) => actions.setPersonName(p.id, e.target.value) }),
    h('div', { class: 'partner-amount' },
      numberInput(p.amount, (v) => actions.setPersonAmount(p.id, v),
        { ariaLabel: t.home.incomeAria(p.name), className: 'partner-input' }),
      h('span', { class: 'unit' }, currency),
    ),
    canRemove
      ? h('button', { class: 'person-del', type: 'button', title: t.home.delPersonTitle(p.name),
          onClick: () => { confirmDialog(t.home.delPersonConfirm(p.name), { title: t.home.delPersonDialogTitle, okLabel: t.common.delete, danger: true }).then((ok) => { if (ok) actions.removePerson(p.id); }); } }, '×')
      : null,
  );
}

function addPersonBox() {
  return h('button', { class: 'person-add', type: 'button',
    onClick: () => actions.addPerson() }, t.home.addIncome);
}

function splitCard(split, cur) {
  const grand = split.reduce((sum, s) => sum + s.total, 0) || 1;
  const hasPersonal = split.some((s) => s.personal > 0);
  const over = split.filter((s) => s.over > 0);
  return h('div', { class: 'card split' },
    h('div', { class: 'split-head' },
      h('span', { class: 'split-title' }, t.home.splitTitle),
      h('span', { class: 'split-hint' }, hasPersonal ? t.home.splitHintPersonal : t.home.splitHintProportional),
    ),
    h('div', { class: 'split-bar' },
      ...split.map((s) => h('div', { class: 'split-seg', style: { width: formatPercent(s.total / grand), background: s.color } })),
    ),
    h('div', { class: 'split-legend' },
      ...split.map((s) => splitLegend(s, cur, grand)),
    ),
    ...over.map((s) => h('div', { class: 'split-warn' },
      t.home.splitWarn(s.name, formatMoney(s.over, cur)))),
  );
}
function splitLegend(s, cur, grand) {
  const isOver = s.over > 0;
  return h('div', { class: 'split-item' },
    h('span', { class: 'dot', style: { background: s.color } }),
    h('span', { class: 'split-name' }, `${s.name} · ${formatPercent(s.total / grand)}`),
    h('span', { class: `split-amount ${isOver ? 'is-over' : ''}` }, formatMoney(s.total, cur)),
  );
}

/* ---------- Cheltuiala cu parti + emoji ---------- */
function expenseRow(e, currency, people = []) {
  const cat = CAT_CYCLE.includes(e.category) ? e.category : 'need';
  const hasItems = Array.isArray(e.items) && e.items.length > 0;
  const amount = expenseAmount(e);
  const isOpen = expanded.has(e.id);
  const multi = people.length > 1;
  const owner = people.find((p) => p.id === expenseOwnerId(e)) || null;

  // Bulina de proprietar. La o cheltuiala CU parti, proprietarul e derivat din parti
  // (culoare doar daca toate sunt ale aceleiasi persoane, altfel comun) si NU e clicabil -
  // se schimba din partile individuale. La o cheltuiala simpla, bulina e clicabila.
  const ownerDot = !multi
    ? null
    : hasItems
      ? h('span', {
          class: 'owner-dot owner-dot--static',
          title: owner ? t.home.ownerExpenseTitle(owner.name) : t.common.common,
          style: owner ? { background: owner.color, borderColor: owner.color } : {},
        })
      : h('button', {
          class: 'owner-dot', type: 'button',
          title: owner ? t.home.ownerExpenseTitle(owner.name) : t.common.common,
          style: { background: owner ? owner.color : 'transparent' },
          onClick: (ev) => { ev.stopPropagation(); toggleOwner(e.id); },
        });

  const icon = e.icon || '•';
  // Text ASCII (ex: "ETF", "@@@@") e mai lat decat un emoji: il micsoram dupa lungime
  // ca sa incapa in patratel. Emoji-urile (non-ASCII) raman la marimea normala.
  const isText = /^[\x20-\x7E]+$/.test(icon);
  const iconTextClass = isText ? `icon-box--text len-${Math.min(icon.length, 4)}` : '';
  const iconBtn = h('button', {
    class: `icon-box icon-box--md icon-box--btn ${iconTextClass}`.trim(), type: 'button', title: t.home.iconTitle,
    onClick: (ev) => { ev.stopPropagation(); togglePicker(e.id); },
  }, icon);

  // Doar afisaj: schimbarea tipului se face in panoul deschis (2 pasi), nu cu un tap din greseala.
  const pill = h('span', { class: `pill pill--${cat}` }, CAT_LABEL[cat]);

  const amountEl = hasItems
    ? h('div', { class: 'row-amount' },
        h('span', { class: 'amount-sum', title: t.home.amountSumTitle }, formatNumber(amount)),
        h('span', { class: 'unit' }, currency))
    : h('div', {
        class: 'row-amount row-amount--edit',
        // Tap oriunde in zona sumei (inclusiv pe moneda) = ca si cum ai apasa pe valoare.
        onClick: (ev) => {
          ev.stopPropagation();
          const inp = ev.currentTarget.querySelector('input');
          if (inp && ev.target !== inp) { inp.focus(); inp.select(); }
        },
      },
        numberInput(e.amount, (v) => actions.setExpenseAmount(e.id, v),
          { ariaLabel: t.home.amountAria(e.name), className: 'amount-input' }),
        h('span', { class: 'unit' }, currency));

  const header = h('div', { class: 'row-head', onClick: () => toggleExpand(e.id) },
    iconBtn,
    h('div', { class: 'row-main' },
      h('div', { class: 'row-title' },
        h('span', { class: 'row-name' }, e.name),
        hasItems ? h('span', { class: 'parts-count', title: t.home.amountSumTitle }, `${e.items.length}p`) : null,
      ),
      pill,
    ),
    amountEl,
    ownerDot,
    h('span', { class: 'chev', 'aria-hidden': 'true' }, '⌄'),
  );

  const drawer = isOpen ? subDrawer(e, currency, hasItems, people) : null;
  return h('li', { class: `row-wrap ${isOpen ? 'is-open' : ''}` }, header, drawer);
}

// Stratul de popup-uri, randat o singura data la nivelul ecranului (in afara randurilor).
function pickerLayer(state) {
  if (openPicker) {
    const e = state.expenses.find((x) => x.id === openPicker);
    if (e) return emojiPicker(e.id);
  }
  if (openOwner) {
    const e = state.expenses.find((x) => x.id === openOwner.expenseId);
    if (e) return ownerPickerEl(e, openOwner.itemId, state.people);
  }
  if (openMenu) {
    const idx = state.expenses.findIndex((x) => x.id === openMenu);
    if (idx >= 0) return rowMenu(state.expenses[idx], idx, state.expenses.length);
  }
  return null;
}

// Meniul de actiuni al unei cheltuieli: muta sus/jos, duplica, sterge.
function rowMenu(e, index, count) {
  const item = (label, opts, onClick) => h('button', {
    class: `menu-item ${opts.danger ? 'menu-item--danger' : ''}`.trim(), type: 'button',
    disabled: !!opts.disabled, onClick,
  }, label);

  const askDelete = () => {
    closeMenu();
    confirmDialog(t.home.delExpenseConfirm(e.name), { title: t.home.delExpenseDialogTitle, okLabel: t.common.delete, danger: true })
      .then((ok) => { if (ok) actions.removeExpense(e.id); });
  };

  return fragment(
    h('div', { class: 'picker-backdrop', onClick: closeMenu }),
    h('div', { class: 'menu-pop' },
      h('div', { class: 'menu-pop-title' }, e.name),
      item(`↑  ${t.home.moveUp}`, { disabled: index === 0 }, () => { openMenu = null; actions.moveExpense(e.id, -1); }),
      item(`↓  ${t.home.moveDown}`, { disabled: index === count - 1 }, () => { openMenu = null; actions.moveExpense(e.id, 1); }),
      item(`⧉  ${t.home.duplicate}`, {}, () => { openMenu = null; actions.duplicateExpense(e.id); }),
      item(`×  ${t.common.delete}`, { danger: true }, askDelete),
    ),
  );
}

// Selector "cui apartine" - modal centrat. itemId null = cheltuiala; altfel = o parte.
function ownerPickerEl(e, itemId, people) {
  const isNew = itemId === '__new__';
  const target = isNew ? null : (itemId ? (e.items || []).find((i) => i.id === itemId) : e);
  const currentId = isNew ? (pendingOwner[e.id] || null) : (target ? (target.personId || null) : null);

  const option = (label, personId, color) => h('button', {
    class: 'owner-option', type: 'button',
    onClick: () => pickOwner(e.id, itemId, personId),
  },
    h('span', { class: 'owner-swatch', style: { background: color || 'transparent', borderStyle: color ? 'solid' : 'dashed' } }),
    h('span', null, label),
    currentId === (personId || null) ? h('span', { class: 'owner-check' }, '✓') : null,
  );

  return fragment(
    h('div', { class: 'picker-backdrop', onClick: closeOwner }),
    h('div', { class: 'owner-pop' },
      h('div', { class: 'owner-pop-title' }, itemId ? t.home.ownerWhoPart : t.home.ownerWho),
      option(t.common.common, null, null),
      ...people.map((p) => option(p.name, p.id, p.color)),
    ),
  );
}

const PENCIL_SVG = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
const CHECK_SVG = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';

function subDrawer(e, currency, hasItems, people) {
  const items = e.items || [];
  const cat = CAT_CYCLE.includes(e.category) ? e.category : 'need';
  const isEditing = editing.has(e.id);
  return h('div', { class: 'subs' },
    h('div', { class: 'drawer-head' },
      h('button', {
        class: `edit-toggle ${isEditing ? 'is-active' : ''}`, type: 'button',
        onClick: () => toggleEditing(e.id),
      },
        svgFromString(isEditing ? CHECK_SVG : PENCIL_SVG),
        h('span', null, isEditing ? t.home.editDone : t.home.editNameType),
      ),
      h('button', {
        class: 'row-menu-btn', type: 'button', title: t.home.actionsTitle, 'aria-label': t.home.actionsAria(e.name),
        onClick: () => toggleMenu(e.id),
      }, '⋯'),
    ),
    isEditing
      ? h('div', { class: 'sub-edit' },
          h('label', { class: 'edit-field' },
            h('span', { class: 'edit-cap' }, t.home.fieldName),
            h('input', { class: 'field edit-name', type: 'text', value: e.name, 'aria-label': t.home.expenseNameAria,
              onChange: (ev) => actions.setExpenseName(e.id, ev.target.value) }),
          ),
          h('div', { class: 'edit-field' },
            h('span', { class: 'edit-cap' }, t.home.fieldType),
            h('div', { class: 'cat-select' },
              ...CAT_CYCLE.map((c) => h('button', {
                class: `cat-opt cat-opt--${c} ${c === cat ? 'is-active' : ''}`, type: 'button',
                onClick: () => actions.setExpenseCategory(e.id, c),
              }, CAT_LABEL[c])),
            ),
          ),
        )
      : null,
    ...items.map((it) => subRow(e.id, it, currency, people)),
    addSubRow(e.id, currency, people),
    !hasItems ? h('p', { class: 'subs-hint' }, t.home.subsHint) : null,
  );
}

function subRow(expenseId, it, currency, people = []) {
  const multi = people.length > 1;
  const owner = people.find((p) => p.id === it.personId) || null;
  const soloColor = people[0] ? people[0].color : 'var(--border-2)';
  const bullet = multi
    ? h('button', {
        class: 'owner-dot owner-dot--sub', type: 'button',
        title: owner ? t.home.ownerPartTitle(owner.name) : t.common.common,
        style: { background: owner ? owner.color : 'transparent' },
        onClick: () => toggleOwner(expenseId, it.id),
      })
    // Un singur venit: cerc de marime normala, in culoarea venitului (doar marcaj).
    : h('span', { class: 'owner-dot owner-dot--sub owner-dot--static',
        style: { background: soloColor, borderColor: soloColor } });

  return h('div', { class: 'sub-row' },
    bullet,
    h('input', { class: 'field sub-name', type: 'text', value: it.name, 'aria-label': t.home.partNameAria,
      onChange: (ev) => actions.setSubItemName(expenseId, it.id, ev.target.value) }),
    h('div', { class: 'row-amount' },
      numberInput(it.amount, (v) => actions.setSubItemAmount(expenseId, it.id, v),
        { ariaLabel: t.home.partAmountAria(it.name), className: 'sub-amount' }),
      h('span', { class: 'unit' }, currency),
    ),
    h('button', { class: 'icon-btn icon-btn--danger', type: 'button', 'aria-label': t.home.delPartAria(it.name),
      onClick: () => actions.removeSubItem(expenseId, it.id) }, '×'),
  );
}

function addSubRow(expenseId, currency, people = []) {
  const multi = people.length > 1;
  const d = subDraft[expenseId] || (subDraft[expenseId] = { name: '', amount: '' });
  const nameInput = h('input', { class: 'field sub-name', type: 'text', value: d.name, placeholder: t.home.addPart, 'aria-label': t.home.addPartNameAria });
  nameInput.addEventListener('input', () => { d.name = nameInput.value; });
  const amountInput = h('input', { class: 'field field--num sub-amount', type: 'text', inputmode: 'decimal', value: d.amount, placeholder: '0', 'aria-label': t.home.addPartAmountAria });
  amountInput.addEventListener('input', () => { d.amount = amountInput.value; });
  const submit = () => {
    const name = d.name.trim();
    if (!name) { nameInput.focus(); return; }
    // Golim ciorna + pending INAINTE de addSubItem, fiindca acesta declanseaza re-randarea sincron.
    // Pastram proprietarul doar daca persoana inca exista.
    const personId = people.some((p) => p.id === pendingOwner[expenseId]) ? pendingOwner[expenseId] : null;
    const amount = draftAmount(d.amount);
    delete pendingOwner[expenseId];
    delete subDraft[expenseId];
    actions.addSubItem(expenseId, { name, amount, personId });
  };
  nameInput.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') amountInput.focus(); });
  amountInput.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') submit(); });

  // Cercul din capat: in mod multi-persoana = selector de proprietar pt partea noua;
  // altfel doar un marcaj (cerc gol, inert).
  const owner = people.find((p) => p.id === pendingOwner[expenseId]) || null;
  const soloColor = people[0] ? people[0].color : 'var(--border-2)';
  const dot = multi
    ? h('button', {
        class: 'owner-dot owner-dot--sub', type: 'button',
        title: owner ? t.home.ownerPartTitle(owner.name) : t.home.ownerPartCommonChoose,
        style: { background: owner ? owner.color : 'transparent' },
        onClick: () => toggleOwner(expenseId, '__new__'),
      })
    : h('span', { class: 'owner-dot owner-dot--sub owner-dot--static',
        style: { background: soloColor, borderColor: soloColor } });

  return h('div', { class: 'sub-row sub-row--add' },
    dot,
    nameInput,
    h('div', { class: 'row-amount' },
      amountInput,
      h('span', { class: 'unit' }, currency),
    ),
    h('button', { class: 'sub-add-btn', type: 'button', onClick: submit, title: t.home.addPart, 'aria-label': t.home.addPart }, '+'),
  );
}

function emojiPicker(expenseId) {
  const free = h('input', { class: 'field emoji-free', type: 'text', maxlength: 4, placeholder: t.home.emojiPlaceholder, 'aria-label': t.home.emojiAria });
  free.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' && free.value.trim()) pickEmoji(expenseId, free.value.trim());
  });

  const grid = h('div', { class: 'emoji-grid' },
    ...EMOJIS.map((em) => h('button', { class: 'emoji-cell', type: 'button', onClick: () => pickEmoji(expenseId, em) }, em)),
  );

  return fragment(
    h('div', { class: 'picker-backdrop', onClick: () => togglePicker(expenseId) }),
    h('div', { class: 'emoji-pop' },
      grid,
      h('div', { class: 'emoji-free-row' }, free, h('button', { class: 'btn btn--sub', type: 'button', onClick: () => { if (free.value.trim()) pickEmoji(expenseId, free.value.trim()); } }, t.home.emojiOk)),
    ),
  );
}

/* ---------- Adaugare cheltuiala ---------- */
// Ciorna se pastreaza la nivel de modul, ca sa NU se piarda la re-randare
// (aplicatia re-randeaza tot la fiecare actiune, iar inputurile sunt necontrolate).
const expenseDraft = { name: '', amount: '', category: 'need' };

function addExpenseCard() {
  const d = expenseDraft;
  const nameInput = h('input', { class: 'field', type: 'text', value: d.name, placeholder: t.home.expenseNamePlaceholder, 'aria-label': t.home.expenseNameNewAria });
  nameInput.addEventListener('input', () => { d.name = nameInput.value; });
  const amountInput = h('input', { class: 'field field--num', type: 'text', inputmode: 'decimal', value: d.amount, placeholder: '0', 'aria-label': t.home.expenseAmountNewAria });
  amountInput.addEventListener('input', () => { d.amount = amountInput.value; });

  // Control segmentat: toate cele 3 categorii vizibile, cea aleasa evidentiata.
  // Mai clar decat o pastila care cicleaza la tap (oamenii nu stiau ca se poate schimba).
  const catOptions = CAT_CYCLE.map((c) => h('button', {
    class: `cat-opt cat-opt--${c} ${c === d.category ? 'is-active' : ''}`, type: 'button',
    'aria-pressed': String(c === d.category),
  }, CAT_LABEL[c]));
  catOptions.forEach((btn, i) => btn.addEventListener('click', () => {
    d.category = CAT_CYCLE[i];
    catOptions.forEach((b, j) => {
      const on = CAT_CYCLE[j] === d.category;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-pressed', String(on));
    });
  }));
  const catSelect = h('div', { class: 'cat-select' }, ...catOptions);

  const submit = () => {
    const name = d.name.trim();
    if (!name) { nameInput.focus(); return; }
    // Golim ciorna INAINTE de addExpense (care re-randeaza sincron), altfel noul input
    // ar ramane cu textul vechi.
    const payload = { name, amount: draftAmount(d.amount), category: d.category };
    d.name = ''; d.amount = ''; d.category = 'need';
    actions.addExpense(payload);
    // Re-focus pe nume dupa re-randare, pentru adaugare rapida in serie.
    setTimeout(() => { const el = document.querySelector('.add-card .field'); if (el) el.focus(); }, 0);
  };
  nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') amountInput.focus(); });
  amountInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });

  return h('div', { class: 'add-card' },
    h('div', { class: 'add-row' },
      nameInput,
      amountInput,
    ),
    h('div', { class: 'add-cat' },
      h('span', { class: 'add-hint' }, t.home.categoryLabel),
      catSelect,
    ),
    h('button', { class: 'btn btn--primary btn--add', type: 'button', onClick: submit }, t.home.add),
  );
}

function breakdown(b, cur) {
  return h('div', { class: 'breakdown' },
    h('span', { class: 'chip' }, h('span', { class: 'dot dot--need' }), `${t.catPlural.need} ${formatMoney(b.needs, cur)}`),
    h('span', { class: 'chip' }, h('span', { class: 'dot dot--want' }), `${t.catPlural.want} ${formatMoney(b.wants, cur)}`),
    h('span', { class: 'chip' }, h('span', { class: 'dot dot--save' }), `${t.catPlural.save} ${formatMoney(b.saved, cur)}`),
  );
}

// Cat a ramas neangajat dupa cheltuieli + economii
function allocationCard(b, cur) {
  const negative = b.unallocated < 0;
  return h('div', { class: `card savings-card ${negative ? 'is-negative' : ''}` },
    h('div', null,
      h('span', { class: 'savings-label' }, negative ? t.home.overBudget : t.home.leftToAllocate),
      h('span', { class: 'savings-sub' }, t.home.ofIncome(formatPercent(b.unallocatedRate))),
    ),
    money(b.unallocated, cur, { big: true }),
  );
}

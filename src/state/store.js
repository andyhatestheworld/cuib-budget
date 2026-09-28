// state/store.js
// Instanta concreta a store-ului aplicatiei + toate actiunile care modifica starea.
// Interfata (views) apeleaza doar aceste actiuni, nu atinge starea direct.

import { createStore } from '../lib/store.js';
import { freshSeed, PERSON_COLORS } from '../data/seed.js';
import { t } from '../i18n.js';

// Ordinea de ciclare a categoriilor unei cheltuieli
const CATEGORY_CYCLE = ['need', 'want', 'save'];

/**
 * Valideaza si repara starea incarcata din localStorage. Intoarce o stare
 * curata sau null (caz in care se cade pe datele demo). Ne apara de date
 * corupte manual sau ramase de la o structura mai veche.
 */
function sanitizeState(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (!Array.isArray(raw.people) || !Array.isArray(raw.expenses)) return null;

  const people = raw.people
    .filter((p) => p && typeof p === 'object')
    .map((p, i) => ({
      id: typeof p.id === 'string' ? p.id : uid('p'),
      name: String(p.name ?? t.defaults.person).trim() || t.defaults.person,
      amount: Math.max(0, toInt(p.amount)),
      color: typeof p.color === 'string' ? p.color : PERSON_COLORS[i % PERSON_COLORS.length],
    }));
  if (people.length === 0) return null; // avem nevoie de cel putin o persoana

  const peopleIds = new Set(people.map((p) => p.id));
  const cleanOwner = (id) => (typeof id === 'string' && peopleIds.has(id) ? id : null);

  const expenses = raw.expenses
    .filter((e) => e && typeof e === 'object')
    .map((e) => {
      const items = Array.isArray(e.items)
        ? e.items
            .filter((it) => it && typeof it === 'object')
            .map((it) => ({
              id: typeof it.id === 'string' ? it.id : uid('i'),
              name: String(it.name ?? t.defaults.part).trim() || t.defaults.part,
              amount: Math.max(0, toInt(it.amount)),
              personId: cleanOwner(it.personId),
            }))
        : null;
      const base = {
        id: typeof e.id === 'string' ? e.id : uid('e'),
        icon: typeof e.icon === 'string' ? e.icon.slice(0, 4) : '💸',
        name: String(e.name ?? t.defaults.expense).trim() || t.defaults.expense,
        category: CATEGORY_CYCLE.includes(e.category) ? e.category : 'need',
        personId: cleanOwner(e.personId),
      };
      if (items && items.length > 0) {
        base.items = items;
        base.amount = items.reduce((sum, it) => sum + it.amount, 0);
      } else {
        base.amount = Math.max(0, toInt(e.amount));
      }
      return base;
    });

  return {
    currency: typeof raw.currency === 'string' ? raw.currency : 'RON',
    month: String(raw.month ?? '').trim() || freshSeed().month,
    people,
    expenses,
  };
}

// v7: venituri multiple (lista de persoane) + proprietar de cheltuiala
export const store = createStore(freshSeed(), { persistKey: 'cuib.state.v7', sanitize: sanitizeState });

// --- Venituri / persoane ---
export function addPerson() {
  store.update((s) => {
    const used = s.people.map((p) => p.color);
    const color = PERSON_COLORS.find((c) => !used.includes(c)) || PERSON_COLORS[s.people.length % PERSON_COLORS.length];
    s.people.push({ id: uid('p'), name: t.defaults.person, amount: 0, color });
  });
}

export function removePerson(id) {
  store.update((s) => {
    if (s.people.length <= 1) return; // pastram cel putin o persoana
    s.people = s.people.filter((p) => p.id !== id);
    for (const e of s.expenses) {
      if (e.personId === id) e.personId = null;
      if (Array.isArray(e.items)) {
        for (const it of e.items) if (it.personId === id) it.personId = null;
      }
    }
  });
}

export function setPersonName(id, name) {
  store.update((s) => {
    const p = s.people.find((x) => x.id === id);
    if (p) p.name = String(name).trim() || t.defaults.person;
  });
}

export function setPersonAmount(id, amount) {
  store.update((s) => {
    const p = s.people.find((x) => x.id === id);
    if (p) p.amount = Math.max(0, toInt(amount));
  });
}

export function cyclePersonColor(id) {
  store.update((s) => {
    const p = s.people.find((x) => x.id === id);
    if (!p) return;
    const i = PERSON_COLORS.indexOf(p.color);
    p.color = PERSON_COLORS[(i + 1) % PERSON_COLORS.length];
  });
}

// Cui apartine o cheltuiala (personId sau null = comun)
export function setExpenseOwner(expenseId, personId) {
  store.update((s) => {
    const e = s.expenses.find((x) => x.id === expenseId);
    if (e) e.personId = personId || null;
  });
}

// Cui apartine o sub-cheltuiala (parte)
export function setSubItemOwner(expenseId, itemId, personId) {
  store.update((s) => {
    const e = s.expenses.find((x) => x.id === expenseId);
    const it = e && e.items && e.items.find((y) => y.id === itemId);
    if (it) it.personId = personId || null;
  });
}

// --- Cheltuieli ---
export function addExpense({ name, amount, category = 'need', icon = '💸' }) {
  store.update((s) => {
    s.expenses.push({
      id: uid('e'),
      icon,
      name: String(name).trim() || t.defaults.expense,
      amount: Math.max(0, toInt(amount)),
      category: CATEGORY_CYCLE.includes(category) ? category : 'need',
    });
  });
}

export function setExpenseAmount(id, amount) {
  store.update((s) => {
    const e = s.expenses.find((x) => x.id === id);
    if (e) e.amount = Math.max(0, toInt(amount));
  });
}

export function setExpenseCategory(id, category) {
  store.update((s) => {
    const e = s.expenses.find((x) => x.id === id);
    if (e && CATEGORY_CYCLE.includes(category)) e.category = category;
  });
}

export function setExpenseName(id, name) {
  store.update((s) => {
    const e = s.expenses.find((x) => x.id === id);
    if (e) e.name = String(name).trim() || e.name;
  });
}

export function setExpenseIcon(id, icon) {
  store.update((s) => {
    const e = s.expenses.find((x) => x.id === id);
    if (e && icon) e.icon = String(icon).slice(0, 4);
  });
}

export function removeExpense(id) {
  store.update((s) => {
    s.expenses = s.expenses.filter((x) => x.id !== id);
  });
}

// Muta o cheltuiala in sus (dir=-1) sau in jos (dir=+1) in lista.
export function moveExpense(id, dir) {
  store.update((s) => {
    const i = s.expenses.findIndex((x) => x.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= s.expenses.length) return;
    [s.expenses[i], s.expenses[j]] = [s.expenses[j], s.expenses[i]];
  });
}

// Duplica o cheltuiala (cu id-uri noi) si o insereaza imediat dupa original.
export function duplicateExpense(id) {
  store.update((s) => {
    const i = s.expenses.findIndex((x) => x.id === id);
    if (i < 0) return;
    const src = s.expenses[i];
    const copy = {
      ...src,
      id: uid('e'),
      name: `${src.name} (copie)`,
      items: Array.isArray(src.items)
        ? src.items.map((it) => ({ ...it, id: uid('i') }))
        : undefined,
    };
    if (!copy.items) delete copy.items;
    s.expenses.splice(i + 1, 0, copy);
  });
}

// --- Sub-cheltuieli (parti ale unei cheltuieli) ---
// Cand o cheltuiala are parti, suma ei ramane sincronizata cu totalul partilor.

export function addSubItem(expenseId, { name, amount, personId = null }) {
  store.update((s) => {
    const e = s.expenses.find((x) => x.id === expenseId);
    if (!e) return;
    if (!Array.isArray(e.items)) e.items = [];
    // Cand incepi sa detaliezi o cheltuiala care avea deja o suma directa,
    // pastreaz-o ca prima parte ca sa nu se piarda.
    if (e.items.length === 0 && toInt(e.amount) > 0) {
      e.items.push({ id: uid('i'), name: t.defaults.unspecified, amount: toInt(e.amount), personId: null });
    }
    e.items.push({
      id: uid('i'),
      name: String(name).trim() || t.defaults.part,
      amount: Math.max(0, toInt(amount)),
      personId: personId || null,
    });
    syncAmount(e);
  });
}

export function setSubItemName(expenseId, itemId, name) {
  store.update((s) => {
    const it = findItem(s, expenseId, itemId);
    if (it) it.name = String(name).trim() || t.defaults.part;
  });
}

export function setSubItemAmount(expenseId, itemId, amount) {
  store.update((s) => {
    const e = s.expenses.find((x) => x.id === expenseId);
    const it = e && e.items && e.items.find((y) => y.id === itemId);
    if (it) {
      it.amount = Math.max(0, toInt(amount));
      syncAmount(e);
    }
  });
}

export function removeSubItem(expenseId, itemId) {
  store.update((s) => {
    const e = s.expenses.find((x) => x.id === expenseId);
    if (!e || !e.items) return;
    e.items = e.items.filter((y) => y.id !== itemId);
    if (e.items.length > 0) {
      syncAmount(e);
    } else {
      // fara parti -> redevine suma directa, editabila (0, fiindca nu mai e nimic detaliat)
      e.amount = 0;
      delete e.items;
    }
  });
}

function findItem(s, expenseId, itemId) {
  const e = s.expenses.find((x) => x.id === expenseId);
  return e && e.items ? e.items.find((y) => y.id === itemId) : null;
}

function syncAmount(e) {
  if (Array.isArray(e.items) && e.items.length > 0) {
    e.amount = e.items.reduce((sum, it) => sum + toNum(it.amount), 0);
  }
}

// --- Setari ---
export function setMonth(month) {
  store.update((s) => {
    s.month = String(month).trim() || s.month;
  });
}

export function setCurrency(currency) {
  store.update((s) => {
    s.currency = String(currency).trim() || s.currency;
  });
}

export function resetAll() {
  store.reset();
}

// --- Backup ---
// Copie serializabila a starii curente (pentru export/download).
export function exportState() {
  return structuredClone(store.get());
}

// Incarca o stare din backup: o validam/reparam intai; daca e valida o aplicam.
// Intoarce true la succes, false daca fisierul nu contine o stare utilizabila.
export function importState(raw) {
  const clean = sanitizeState(raw);
  if (!clean) return false;
  store.set(clean);
  return true;
}

// --- ajutoare ---
function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// Sumele sunt in lei intregi: rotunjim la introducere, ca sa nu existe jumatati de leu.
function toInt(v) {
  return Math.round(toNum(v));
}

function uid(prefix) {
  return prefix + Math.random().toString(36).slice(2, 9);
}

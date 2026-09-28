// core/budget.js
// Toata logica de buget, ca functii pure. Primesc date simple, returneaza rezultate.
// Fara DOM, fara localStorage, fara stare globala => usor de testat cu Vitest.

import { clamp } from './format.js';

/**
 * Suma efectiva a unei cheltuieli:
 * daca are parti (items), suma = totalul partilor; altfel = suma directa.
 */
export function expenseAmount(expense) {
  if (Array.isArray(expense.items) && expense.items.length > 0) {
    return expense.items.reduce((sum, it) => sum + num(it.amount), 0);
  }
  return num(expense.amount);
}

/**
 * Proprietarul "unificat" al unei cheltuieli (id de persoana sau null = comun/mixt):
 *  - fara parti: proprietarul ei direct.
 *  - cu parti: proprietarul DOAR daca toate partile apartin aceleiasi persoane; altfel null.
 * Se calculeaza singur, nu se seteaza manual.
 */
export function expenseOwnerId(expense) {
  if (Array.isArray(expense.items) && expense.items.length > 0) {
    const first = expense.items[0].personId || null;
    return expense.items.every((it) => (it.personId || null) === first) ? first : null;
  }
  return expense.personId || null;
}

/** Suma cheltuielilor dintr-o categorie ('need' | 'want') */
export function sumByCategory(expenses = [], category) {
  return expenses.reduce(
    (total, e) => (e.category === category ? total + expenseAmount(e) : total),
    0
  );
}

/** Venitul total (suma tuturor persoanelor) */
export function totalIncome(people = []) {
  return people.reduce((sum, p) => sum + num(p.amount), 0);
}

/**
 * Calculul central al bugetului dupa modelul 50-30-20.
 *   nevoi    = cheltuieli 'need'  (tinta 50% din venit)
 *   dorinte  = cheltuieli 'want'  (tinta 30% din venit)
 *   economii = alocari 'save'     (tinta 20% din venit) - puse deoparte intentionat
 *
 * `spending` = nevoi + dorinte (bani cheltuiti)
 * `totalOut` = nevoi + dorinte + economii (tot ce iese din venit lunar)
 * `unallocated` = venit - totalOut (bani ramasi de alocat)
 */
export function computeBudget(state) {
  const income = totalIncome(state.people);
  const needs = sumByCategory(state.expenses, 'need');
  const wants = sumByCategory(state.expenses, 'want');
  const saved = sumByCategory(state.expenses, 'save');

  const spending = needs + wants;
  const totalOut = spending + saved;
  const unallocated = income - totalOut;

  const bucket = (actual, targetRatio) => {
    const target = income * targetRatio;
    return {
      actual,
      target,
      fill: target > 0 ? clamp(actual / target, 0, 1) : 0,
      share: income > 0 ? actual / income : 0,
    };
  };

  return {
    income,
    needs,
    wants,
    saved,
    spending,
    totalOut,
    unallocated,
    savingsRate: income > 0 ? saved / income : 0,
    unallocatedRate: income > 0 ? unallocated / income : 0,
    rule: {
      needs: bucket(needs, 0.5),
      wants: bucket(wants, 0.3),
      savings: bucket(saved, 0.2),
    },
  };
}

/**
 * Cine cat plateste din cheltuieli (need+want), tinand cont de proprietar:
 *   - cheltuielile/partile fara proprietar (comune) se impart PROPORTIONAL cu venitul
 *   - cele cu proprietar sunt platite INTEGRAL de acea persoana
 * Fara proprietari => pur proportional (ca inainte). Economiile nu intra aici.
 * Returneaza pentru fiecare persoana: { common, personal, total }.
 */
export function paymentSplit(state) {
  const people = state.people || [];
  const income = totalIncome(people);
  const n = people.length || 1;

  let common = 0;
  const personal = {};
  people.forEach((p) => { personal[p.id] = 0; });

  const attribute = (personId, amount) => {
    if (personId && personal[personId] !== undefined) personal[personId] += amount;
    else common += amount;
  };

  for (const e of state.expenses) {
    if (e.category !== 'need' && e.category !== 'want') continue;
    if (Array.isArray(e.items) && e.items.length > 0) {
      for (const it of e.items) attribute(it.personId, num(it.amount));
    } else {
      attribute(e.personId, num(e.amount));
    }
  }

  // Repartizarea comuna trebuie sa insumeze EXACT `common`, altfel se pierd lei la
  // rotunjire (ex: 100 impartit la 3 ar da 33+33+33=99). Folosim metoda celui mai
  // mare rest: dam fiecaruia partea intreaga, apoi impartim leii ramasi celor cu
  // cea mai mare parte fractionara.
  const rawShares = people.map((p) => {
    const ratio = income > 0 ? num(p.amount) / income : 1 / n;
    return common * ratio;
  });
  const commonShares = rawShares.map((v) => Math.floor(v));
  let remainder = Math.round(common - commonShares.reduce((a, b) => a + b, 0));
  const byFraction = rawShares
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac);
  for (let k = 0; k < remainder && k < byFraction.length; k++) {
    commonShares[byFraction[k].i] += 1;
  }

  return people.map((p, idx) => {
    const commonShare = commonShares[idx];
    const own = Math.round(personal[p.id]);
    const total = commonShare + own;
    const pInc = num(p.amount);
    return {
      id: p.id, name: p.name, color: p.color, income: pInc,
      common: commonShare, personal: own, total,
      over: Math.max(0, total - pInc), // cat plateste peste venitul lui (deficit)
    };
  });
}

// --- ajutor intern ---
function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

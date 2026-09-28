// data/seed.js
// Datele demo initiale (fictive). Structura (sume, iconite, categorii) e independenta
// de limba; numele vin din i18n (t.demo), deci demo-ul e in limba activa.
// Implicit: o singura persoana (mod individual). Se pot adauga mai multe.

import { t } from '../i18n.js';

// Paleta de culori pentru persoane (discrete, mute, in ordine la adaugare)
export const PERSON_COLORS = ['#2f76d6', '#e0447a', '#0d9488', '#e0851e', '#7c5cd6', '#0d9f5a'];

/**
 * Datele demo, construite proaspat la fiecare apel, cu numele in limba activa.
 * Categorii 50-30-20: 'need' = nevoie, 'want' = dorinta, 'save' = economii/investitii.
 */
export function freshSeed() {
  const d = t.demo;
  return {
    currency: 'RON',
    month: d.month,
    people: [
      { id: 'p1', name: d.me, amount: 9000, color: PERSON_COLORS[0] },
    ],
    expenses: [
      { id: 'e1', icon: '🏠', name: d.rent, amount: 2500, category: 'need' },
      {
        id: 'e2', icon: '🛒', name: d.food, amount: 1500, category: 'need',
        items: [
          { id: 'e2a', name: d.groceries, amount: 1000 },
          { id: 'e2b', name: d.restaurant, amount: 350 },
          { id: 'e2c', name: d.coffee, amount: 150 },
        ],
      },
      { id: 'e3', icon: '🧾', name: d.bills, amount: 700, category: 'need' },
      { id: 'e4', icon: '🚗', name: d.transport, amount: 500, category: 'need' },
      { id: 'e5', icon: '📱', name: d.subscriptions, amount: 300, category: 'want' },
      { id: 'e6', icon: '✨', name: d.fun, amount: 700, category: 'want' },
      { id: 'e7', icon: '🛟', name: d.emergency, amount: 1200, category: 'save' },
      { id: 'e8', icon: '📈', name: d.etf, amount: 800, category: 'save' },
    ],
  };
}

// components/ui.js
// Componente vizuale mici si reutilizabile, construite peste h().
// Toate returneaza noduri DOM reale.

import { h } from '../lib/dom.js';
import { formatMoney, formatPercent, evalExpression } from '../core/format.js';

/** Bara de progres. variant: 'need' | 'want' | 'savings' | 'brand' | 'over' */
export function meter(ratio, variant = 'brand') {
  return h(
    'div',
    { class: `meter meter--${variant}` },
    h('div', { class: 'meter-fill', style: { width: formatPercent(ratio) } })
  );
}

/** Suma formatata, optional mare (display) */
export function money(value, currency, { big = false } = {}) {
  return h('span', { class: big ? 'money money--big' : 'money' }, formatMoney(value, currency));
}

/**
 * Input numeric care comite valoarea la iesirea din camp (change), nu la fiecare tasta.
 * onCommit primeste numarul.
 */
export function numberInput(value, onCommit, { ariaLabel, className = '' } = {}) {
  // type=text (nu number) ca sa poti scrie si expresii gen "50+30"; evaluam la commit.
  return h('input', {
    class: `field field--num ${className}`.trim(),
    type: 'text',
    inputmode: 'decimal',
    value,
    'aria-label': ariaLabel,
    onChange: (e) => {
      const n = evalExpression(e.target.value);
      onCommit(Number.isNaN(n) ? Number(value) || 0 : n);
    },
  });
}

/** Eticheta mica de sectiune (uppercase) */
export function eyebrow(text) {
  return h('p', { class: 'eyebrow' }, text);
}

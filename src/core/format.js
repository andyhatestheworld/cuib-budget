// core/format.js
// Functii pure de formatare pentru afisare. Fara DOM, fara stare globala,
// ca sa fie usor de testat separat.

/** Formateaza un numar intreg cu separator de mii: 12500 -> "12.500" */
export function formatNumber(value) {
  const n = Math.round(Number(value) || 0);
  const sign = n < 0 ? '-' : '';
  return sign + Math.abs(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** Formateaza o suma cu moneda: formatMoney(12500, "lei") -> "12.500 lei" */
export function formatMoney(value, currency = 'lei') {
  return `${formatNumber(value)} ${currency}`;
}

/** Procent intreg dintr-un raport: formatPercent(0.234) -> "23%" */
export function formatPercent(ratio) {
  return `${Math.round((Number(ratio) || 0) * 100)}%`;
}

/** Limiteaza o valoare intre min si max */
export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * Evalueaza o expresie aritmetica simpla (+ - * /) IN SIGURANTA, fara eval/Function.
 * Ex: "50+30" -> 80, "3*15" -> 45, "100-10-5" -> 85. Numar simplu -> el insusi.
 * Intoarce NaN daca expresia e invalida (apelantul decide ce face atunci).
 */
export function evalExpression(input) {
  const s = String(input).trim();
  if (s === '') return 0;
  if (/^-?\d*\.?\d+$/.test(s)) return Number(s);        // numar simplu (posibil negativ)
  if (!/^[\d.\s+*/-]+$/.test(s)) return NaN;            // doar cifre, . spatii si + - * /
  const tokens = s.match(/\d*\.?\d+|[+*/-]/g);
  if (!tokens) return NaN;

  // Pas 1: rezolva * si / (precedenta mai mare)
  const pass1 = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === '*' || t === '/') {
      const prev = pass1.pop();
      const next = Number(tokens[++i]);
      if (typeof prev !== 'number' || !Number.isFinite(next)) return NaN;
      pass1.push(t === '*' ? prev * next : prev / next);
    } else if (t === '+' || t === '-') {
      pass1.push(t);
    } else {
      pass1.push(Number(t));
    }
  }

  // Pas 2: rezolva + si - (de la stanga la dreapta)
  let result = pass1[0];
  if (typeof result !== 'number') return NaN;
  for (let i = 1; i < pass1.length; i += 2) {
    const op = pass1[i];
    const val = pass1[i + 1];
    if ((op !== '+' && op !== '-') || typeof val !== 'number') return NaN;
    result = op === '+' ? result + val : result - val;
  }
  return Number.isFinite(result) ? result : NaN;
}

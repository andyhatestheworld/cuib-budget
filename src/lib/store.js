// lib/store.js
// Un store reactiv minimal, generic si reutilizabil.
// - get()            citeste starea curenta
// - update(mutator)  modifica starea (primeste un draft mutabil)
// - reset()          revine la starea initiala
// - subscribe(fn)    asculta schimbarile; returneaza functia de dezabonare
// Persistenta in localStorage este optionala (prin persistKey).
// `sanitize` (optional) valideaza/repara starea incarcata din localStorage;
// daca intoarce null, se foloseste starea initiala (protectie la date corupte
// sau ramase de la o versiune veche).

export function createStore(initialState, { persistKey, sanitize } = {}) {
  const initial = structuredClone(initialState);
  let state = loadPersisted() ?? structuredClone(initialState);
  const listeners = new Set();

  function loadPersisted() {
    if (!persistKey) return null;
    try {
      const raw = localStorage.getItem(persistKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return sanitize ? sanitize(parsed) : parsed;
    } catch {
      return null;
    }
  }

  function persist() {
    if (!persistKey) return;
    try {
      localStorage.setItem(persistKey, JSON.stringify(state));
    } catch {
      /* stocare indisponibila (mod privat etc.) - ignoram */
    }
  }

  function emit() {
    for (const fn of listeners) fn(state);
  }

  return {
    get: () => state,

    update(mutator) {
      const draft = structuredClone(state);
      mutator(draft);
      state = draft;
      persist();
      emit();
    },

    reset() {
      state = structuredClone(initial);
      persist();
      emit();
    },

    // Inlocuieste complet starea (ex: import backup). Apelantul e responsabil de validare.
    set(next) {
      state = structuredClone(next);
      persist();
      emit();
    },

    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

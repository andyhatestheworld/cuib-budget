// main.js - punctul de intrare: construieste shell-ul, ruteaza si re-randeaza la schimbari
import { h, mount, fragment, svgFromString } from './lib/dom.js';
import { setRenderer } from './lib/render-bus.js';
import { confirmDialog, alertDialog, chooseDialog } from './lib/dialog.js';
import { store, resetAll, exportState, importState } from './state/store.js';
import { home } from './views/home.js';
import { rule } from './views/rule.js';
import { saveReport } from './views/report.js';
import { t, setLocale, currentLocale } from './i18n.js';

// Link-ul catre codul sursa (repo-ul public).
const REPO_URL = 'https://github.com/andyhatestheworld/cuib-budget';
const ICON_GITHUB = '<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true"><path d="M12 .5A11.5 11.5 0 0 0 .5 12a11.5 11.5 0 0 0 7.86 10.92c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.54-3.88-1.54-.53-1.34-1.3-1.7-1.3-1.7-1.06-.72.08-.71.08-.71 1.17.08 1.79 1.2 1.79 1.2 1.04 1.79 2.73 1.27 3.4.97.1-.75.4-1.27.73-1.56-2.55-.29-5.24-1.28-5.24-5.7 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.8 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.43-2.7 5.4-5.26 5.69.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 23.5 12 11.5 11.5 0 0 0 12 .5Z"/></svg>';

// --- Iconite SVG pentru butoanele din header ---
const ICON_EXPORT = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v11"/><path d="M8 11l4 4 4-4"/><path d="M5 20h14"/></svg>';
const ICON_IMPORT = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V4"/><path d="M8 8l4-4 4 4"/><path d="M5 20h14"/></svg>';

// --- Salvare (meniu: fisier .json sau raport PDF) ---
async function doSave() {
  const choice = await chooseDialog({
    title: t.dialogs.saveTitle,
    options: [
      { label: t.dialogs.jsonLabel, desc: t.dialogs.jsonDesc, value: 'json' },
      { label: t.dialogs.reportLabel, desc: t.dialogs.reportDesc, value: 'report' },
    ],
  });
  if (choice === 'json') downloadJson();
  else if (choice === 'report') saveReport(store.get());
}

function downloadJson() {
  const blob = new Blob([JSON.stringify(exportState(), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `cuib-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function doImport() {
  const ok = await confirmDialog(t.dialogs.importMsg, { title: t.dialogs.importTitle, okLabel: t.dialogs.importOk, danger: true });
  if (!ok) return;
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json,.json';
  input.addEventListener('change', () => {
    const file = input.files && input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      let raw;
      try { raw = JSON.parse(reader.result); } catch { alertDialog(t.dialogs.importInvalidFile, { title: t.dialogs.importFailTitle }); return; }
      if (!importState(raw)) alertDialog(t.dialogs.importInvalidData, { title: t.dialogs.importFailTitle });
    };
    reader.readAsText(file);
  });
  input.click();
}

// --- Tema (light / dark) ---
// Preferinta e separata de datele bugetului, in propria cheie de localStorage.
const THEME_KEY = 'cuib.theme';
const THEME_ICON = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor"/></svg>';

function currentTheme() {
  try { return localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light'; } catch { return 'light'; }
}
function applyTheme(mode) {
  document.documentElement.dataset.theme = mode;
  try { localStorage.setItem(THEME_KEY, mode); } catch { /* stocare indisponibila */ }
}
function toggleTheme() {
  applyTheme(currentTheme() === 'dark' ? 'light' : 'dark');
}
applyTheme(currentTheme()); // aplica inainte de montare, ca sa nu palpaie
document.title = t.docTitle; // titlul tab-ului urmeaza limba activa

const routes = [
  { path: 'home', label: t.nav.home, view: home },
  { path: 'rule', label: t.nav.rule, view: rule },
];
const DEFAULT = 'home';

function currentPath() {
  const p = (location.hash || '').replace(/^#\/?/, '');
  return routes.some((r) => r.path === p) ? p : DEFAULT;
}

// Container in care se randeaza ecranul curent
const viewSlot = h('main', { class: 'view' });

// Navigatie segmentata (sus), refolosita intre randari
const navButtons = routes.map((r) =>
  h('a', { class: 'nav-tab', href: `#/${r.path}`, dataset: { path: r.path } }, r.label)
);

let lastPath = null;

function render() {
  const path = currentPath();
  const route = routes.find((r) => r.path === path);
  const switching = path !== lastPath;

  mount(viewSlot, fragment(route.view(store.get()), sourceFooter()));
  for (const btn of navButtons) {
    btn.classList.toggle('is-active', btn.dataset.path === path);
  }

  if (switching) {
    viewSlot.classList.add('is-switching');
    viewSlot.scrollTop = 0;
    setTimeout(() => viewSlot.classList.remove('is-switching'), 260);
    lastPath = path;
  }
}

function shell() {
  return h('div', { class: 'app' },
    h('header', { class: 'app-header' },
      h('div', { class: 'brand' },
        h('span', { class: 'brand-mark' }, t.appName.slice(0, 1)),
        h('span', { class: 'brand-name' }, t.appName),
      ),
      h('div', { class: 'header-actions' },
        h('button', {
          class: 'icon-round icon-round--lang', type: 'button', title: t.header.langTitle, 'aria-label': t.header.langTitle,
          onClick: () => { setLocale(currentLocale() === 'ro' ? 'en' : 'ro'); location.reload(); },
        }, currentLocale().toUpperCase()),
        h('button', {
          class: 'icon-round', type: 'button', title: t.header.saveTitle, 'aria-label': t.header.saveTitle,
          onClick: doSave,
        }, svgFromString(ICON_EXPORT)),
        h('button', {
          class: 'icon-round', type: 'button', title: t.header.importTitle, 'aria-label': t.header.importTitle,
          onClick: doImport,
        }, svgFromString(ICON_IMPORT)),
        h('button', {
          class: 'icon-round', type: 'button', title: t.header.themeTitle, 'aria-label': t.header.themeTitle,
          onClick: toggleTheme,
        }, svgFromString(THEME_ICON)),
        h('button', {
          class: 'reset-btn', type: 'button', title: t.header.resetTitle,
          onClick: async () => { if (await confirmDialog(t.dialogs.resetMsg, { title: t.dialogs.resetTitle, okLabel: t.dialogs.resetOk, danger: true })) resetAll(); },
        }, t.header.reset),
      ),
    ),
    h('nav', { class: 'nav' }, ...navButtons),
    viewSlot,
  );
}

// Footer cu link catre codul sursa, randat in interiorul zonei derulabile (jos de tot,
// se vede doar cand derulezi pana la capat - nu e lipit permanent).
function sourceFooter() {
  return h('footer', { class: 'app-footer' },
    h('a', { class: 'source-link', href: REPO_URL, target: '_blank', rel: 'noopener noreferrer' },
      svgFromString(ICON_GITHUB),
      h('span', null, t.sourceCode),
    ),
  );
}

// Montare initiala
const root = document.getElementById('app');
mount(root, shell());

setRenderer(render);
store.subscribe(render);
window.addEventListener('hashchange', render);
if (!location.hash) location.hash = `#/${DEFAULT}`;
render();

// lib/dialog.js
// Dialoguri in interfata (nu window.confirm/alert): overlay propriu, tema-aware,
// imperativ (se poate chema din orice modul) si intoarce o promisiune.
//   confirmDialog('Sigur?')            -> Promise<boolean>
//   alertDialog('Ceva n-a mers.')      -> Promise<void>

import { h } from './dom.js';
import { t } from '../i18n.js';

export function confirmDialog(message, { okLabel = t.common.yes, cancelLabel = t.common.no, danger = false, title } = {}) {
  return openDialog({ message, title, okLabel, cancelLabel, danger, showCancel: true });
}

export function alertDialog(message, { okLabel = t.common.ok, title } = {}) {
  return openDialog({ message, title, okLabel, showCancel: false }).then(() => undefined);
}

// Meniu de alegere: intoarce valoarea optiunii alese, sau null la anulare.
// options: [{ label, value, danger }]
export function chooseDialog({ title, message, options }) {
  return new Promise((resolve) => {
    const onKey = (e) => { if (e.key === 'Escape') close(null); };
    const close = (result) => {
      document.removeEventListener('keydown', onKey);
      backdrop.remove();
      resolve(result);
    };

    const card = h('div', { class: 'dlg-card', role: 'dialog', 'aria-modal': 'true' },
      title ? h('div', { class: 'dlg-title' }, title) : null,
      message ? h('div', { class: 'dlg-msg' }, message) : null,
      h('div', { class: 'dlg-choices' },
        ...options.map((o) => h('button', {
          class: `dlg-choice ${o.danger ? 'dlg-choice--danger' : ''}`.trim(), type: 'button',
          onClick: () => close(o.value),
        },
          h('span', { class: 'dlg-choice-label' }, o.label),
          o.desc ? h('span', { class: 'dlg-choice-desc' }, o.desc) : null,
        )),
      ),
    );

    const backdrop = h('div', {
      class: 'dlg-backdrop',
      onClick: (e) => { if (e.target === backdrop) close(null); },
    }, card);

    document.body.appendChild(backdrop);
    document.addEventListener('keydown', onKey);
    const first = card.querySelector('.dlg-choice');
    if (first) first.focus();
  });
}

function openDialog({ message, title, okLabel, cancelLabel, danger, showCancel }) {
  return new Promise((resolve) => {
    const onKey = (e) => {
      if (e.key === 'Escape') close(false);
      else if (e.key === 'Enter') close(true);
    };
    const close = (result) => {
      document.removeEventListener('keydown', onKey);
      backdrop.remove();
      resolve(result);
    };

    const okBtn = h('button', {
      class: `dlg-btn ${danger ? 'dlg-btn--danger' : 'dlg-btn--primary'}`,
      type: 'button', onClick: () => close(true),
    }, okLabel);

    const card = h('div', { class: 'dlg-card', role: 'dialog', 'aria-modal': 'true' },
      title ? h('div', { class: 'dlg-title' }, title) : null,
      h('div', { class: 'dlg-msg' }, message),
      h('div', { class: 'dlg-actions' },
        showCancel
          ? h('button', { class: 'dlg-btn dlg-btn--ghost', type: 'button', onClick: () => close(false) }, cancelLabel)
          : null,
        okBtn,
      ),
    );

    const backdrop = h('div', {
      class: 'dlg-backdrop',
      onClick: (e) => { if (e.target === backdrop) close(false); },
    }, card);

    document.body.appendChild(backdrop);
    document.addEventListener('keydown', onKey);
    okBtn.focus();
  });
}

// lib/dom.js
// Un mic "hyperscript": construieste noduri DOM reale, fara framework si fara innerHTML.
// Textul intra prin createTextNode, deci nu exista risc de injectie (XSS).
//
//   h('div', { class: 'card', onClick: fn }, 'text', h('span', null, 'x'))
//
// Props speciale: class, style (obiect), dataset (obiect), onEvent (functie),
// atribute booleene (true => prezent, false/null => absent).

export function h(tag, props, ...children) {
  const el = document.createElement(tag);

  if (props) {
    for (const [key, value] of Object.entries(props)) {
      if (value == null || value === false) continue;

      if (key === 'class') {
        el.className = value;
      } else if (key === 'style' && typeof value === 'object') {
        Object.assign(el.style, value);
      } else if (key === 'dataset' && typeof value === 'object') {
        Object.assign(el.dataset, value);
      } else if (key.startsWith('on') && typeof value === 'function') {
        el.addEventListener(key.slice(2).toLowerCase(), value);
      } else if (value === true) {
        el.setAttribute(key, '');
      } else {
        el.setAttribute(key, String(value));
      }
    }
  }

  appendChildren(el, children);
  return el;
}

function appendChildren(el, children) {
  for (const child of children) {
    if (child == null || child === false) continue;
    if (Array.isArray(child)) {
      appendChildren(el, child);
    } else if (child instanceof Node) {
      el.appendChild(child);
    } else {
      el.appendChild(document.createTextNode(String(child)));
    }
  }
}

/** Inlocuieste continutul unui container cu un singur nod */
export function mount(container, node) {
  container.replaceChildren(node);
}

/** Fragment: grupeaza mai multe noduri fara un parinte in plus */
export function fragment(...children) {
  const frag = document.createDocumentFragment();
  appendChildren(frag, children);
  return frag;
}

/**
 * Construieste un nod SVG dintr-un sir de markup. De folosit doar cu markup
 * static, controlat de noi (fara date de la utilizator).
 */
export function svgFromString(markup) {
  const wrap = document.createElement('div');
  wrap.innerHTML = markup.trim();
  return wrap.firstElementChild;
}

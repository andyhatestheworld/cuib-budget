// lib/render-bus.js
// Permite componentelor sa ceara o re-randare pentru stare de interfata efemera
// (panouri deschise, selector de emoji) care NU se afla in store.

let renderer = () => {};

export function setRenderer(fn) {
  renderer = fn;
}

export function requestRender() {
  renderer();
}

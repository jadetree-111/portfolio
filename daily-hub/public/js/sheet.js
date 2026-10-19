import { h } from './dom.js';

/**
 * Opens a modal bottom sheet built on <dialog> (focus trap and Esc come from the browser).
 * build(close, dialog) returns the body; close(value) resolves the returned promise.
 */
export function openSheet(title, build, { wide = false } = {}) {
  return new Promise((resolve) => {
    const dialog = h('dialog', { class: `sheet${wide ? ' wide' : ''}`, 'aria-label': title });
    let result;
    const close = (value) => {
      result = value;
      dialog.close();
    };
    const head = h('header', { class: 'sheet-head' },
      h('h2', { text: title }),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': '关闭', onclick: () => close() }, '✕'));
    dialog.append(head, h('div', { class: 'sheet-body' }, build(close, dialog)));
    dialog.addEventListener('close', () => {
      dialog.remove();
      resolve(result);
    });
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) close(); // click on the backdrop
    });
    document.body.append(dialog);
    dialog.showModal();
  });
}

import { h } from './dom.js';

/** Short message at the bottom of the screen. kind: 'info' | 'success' | 'error'. */
export function toast(message, { kind = 'info', ms = 3600 } = {}) {
  const el = h('div', { class: `toast ${kind}`, role: kind === 'error' ? 'alert' : 'status' }, message);
  const box = document.getElementById('toasts');
  box.append(el);
  while (box.children.length > 3) box.firstElementChild.remove(); // a burst of actions should not pile up over the content
  setTimeout(() => el.remove(), kind === 'error' ? ms + 2000 : ms);
}

export const toastError = (err) => toast(err?.message || '出错了，请重试', { kind: 'error' });

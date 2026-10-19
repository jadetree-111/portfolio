// Tiny DOM builder. Text always goes through text nodes / textContent, never innerHTML,
// so data from the server or from AI output can never become markup.
const PROPERTY_ATTRS = new Set(['checked', 'disabled', 'selected', 'hidden', 'multiple', 'required', 'readOnly', 'open']);

function append(el, children) {
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

/** h('button', { class: 'btn', onclick }, 'Label') */
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  let value;
  for (const [key, v] of Object.entries(props ?? {})) {
    if (v == null || v === false) continue;
    if (key === 'class') el.className = v;
    else if (key === 'text') el.textContent = v;
    else if (key === 'value') value = v; // applied after children so <select> options exist
    else if (key === 'style') for (const [p, val] of Object.entries(v)) el.style.setProperty(p, String(val));
    else if (key.startsWith('on') && typeof v === 'function') el.addEventListener(key.slice(2), v);
    else if (PROPERTY_ATTRS.has(key)) el[key] = v;
    else el.setAttribute(key, v === true ? '' : String(v));
  }
  append(el, children);
  if (value !== undefined) el.value = value;
  return el;
}

export const $ = (selector, root = document) => root.querySelector(selector);
/** Replaces a container's children. Flattens arrays and skips null / false / '' so `cond && node` works. */
export const mount = (container, ...nodes) => container.replaceChildren(...nodes.flat(Infinity).filter((n) => n != null && n !== false && n !== ''));

export function debounce(fn, ms = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

export const spinner = (label = '加载中…') => h('p', { class: 'empty muted', role: 'status' }, h('span', { class: 'spin', 'aria-hidden': 'true' }), ` ${label}`);

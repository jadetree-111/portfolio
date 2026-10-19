import { h, mount } from '../dom.js';
import { toast } from '../toast.js';
import { DEFAULT_PERIODS } from '/shared/schedule.js';
import { toMin, fromMin } from '/shared/dates.js';

const MAX_PERIODS = 20;

/** Editable table of class periods (start/end per period). onSave(rows) persists them. */
export function periodsEditor(initial, onSave) {
  let rows = initial.map((p) => ({ start: p.start, end: p.end }));
  const box = h('div', { class: 'stack' });

  function draw() {
    mount(box,
      rows.map((p, i) => h('div', { class: 'row' },
        h('span', { class: 'small muted', style: { width: '3.2em', flex: 'none' } }, `第${i + 1}节`),
        h('input', { type: 'time', value: p.start, 'aria-label': `第${i + 1}节开始时间`, oninput: (e) => { p.start = e.target.value; } }),
        h('input', { type: 'time', value: p.end, 'aria-label': `第${i + 1}节结束时间`, oninput: (e) => { p.end = e.target.value; } }),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': `删除第${i + 1}节`, onclick: () => { rows.splice(i, 1); draw(); } }, '✕'))),
      h('div', { class: 'row wrap' },
        h('button', {
          class: 'btn small', type: 'button', disabled: rows.length >= MAX_PERIODS,
          onclick: () => {
            const last = rows.at(-1);
            const start = last ? fromMin(Math.min(toMin(last.end) + 10, 1380)) : '08:00';
            rows.push({ start, end: fromMin(Math.min(toMin(start) + 45, 1439)) });
            draw();
          },
        }, '＋ 加一节'),
        h('button', { class: 'btn small', type: 'button', onclick: () => { rows = DEFAULT_PERIODS.map((p) => ({ start: p.start, end: p.end })); draw(); } }, '恢复默认'),
        h('button', {
          class: 'btn small primary', type: 'button',
          onclick: () => {
            if (!rows.length) return toast('至少需要一节', { kind: 'error' });
            const bad = rows.findIndex((p) => !p.start || !p.end || p.start >= p.end);
            if (bad !== -1) return toast(`第 ${bad + 1} 节的下课时间需要晚于上课时间`, { kind: 'error' });
            onSave(rows);
          },
        }, '保存节次时间')));
  }
  draw();
  return box;
}

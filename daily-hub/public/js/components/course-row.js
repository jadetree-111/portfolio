import { h } from '../dom.js';
import { timeRange } from '../format.js';
import { WEEKDAY_CN } from '/shared/dates.js';

const periodText = (c) => {
  if (!c.start_period) return '时间待定';
  return c.end_period > c.start_period ? `第${c.start_period}-${c.end_period}节` : `第${c.start_period}节`;
};

/** Row for one course occurrence. `c` should carry effective start/end (see coursesOn). */
export function courseRow(c, { onOpen, showDay = false } = {}) {
  const body = [
    h('div', { class: 'task-title' }, c.name),
    h('div', { class: 'task-meta' },
      showDay && h('span', {}, `周${WEEKDAY_CN[c.weekday - 1]}`),
      h('span', {}, `🕐 ${timeRange(c.start, c.end) || periodText(c)}`),
      c.location && h('span', {}, `📍 ${c.location}`),
      c.teacher && h('span', {}, c.teacher)),
  ];
  return h('div', { class: 'task' },
    h('span', { class: 'badge good', 'aria-hidden': 'true' }, '课'),
    onOpen
      ? h('button', { class: 'task-main', type: 'button', onclick: () => onOpen(c) }, body)
      : h('div', { class: 'task-main' }, body));
}

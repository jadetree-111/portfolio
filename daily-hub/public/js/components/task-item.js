import { h } from '../dom.js';
import { api } from '../api.js';
import { toastError } from '../toast.js';
import { notifyChange } from '../store.js';
import { friendlyDate, timeRange, KIND_LABEL } from '../format.js';
import { localYmd } from '/shared/dates.js';

/** One row in a task list. onOpen(task) is called when the row body is tapped. */
export function taskItem(task, { onOpen, showDate = true } = {}) {
  const today = localYmd();
  const overdue = !task.done && task.date && (task.date < today || (task.date === today && task.time && task.time < new Date().toTimeString().slice(0, 5)));
  const when = [showDate && task.date ? friendlyDate(task.date, today) : '', timeRange(task.time, task.end_time)].filter(Boolean).join(' ');

  const check = h('input', {
    class: 'task-check', type: 'checkbox', checked: task.done, 'aria-label': `${task.done ? '取消完成' : '完成'}：${task.title}`,
    onchange: async (e) => {
      try {
        await api.patch(`/api/tasks/${task.id}`, { done: e.target.checked });
        notifyChange();
      } catch (err) {
        e.target.checked = !e.target.checked;
        toastError(err);
      }
    },
  });

  return h('div', { class: `task${task.done ? ' done' : ''}${overdue ? ' overdue' : ''}${task.priority === 'high' ? ' high' : ''}` },
    check,
    h('button', { class: 'task-main', type: 'button', onclick: () => onOpen?.(task) },
      h('div', { class: 'task-title' }, task.title),
      h('div', { class: 'task-meta' },
        when && h('span', { class: 'when' }, `🕐 ${when}${overdue ? '（已过期）' : ''}`),
        task.location && h('span', {}, `📍 ${task.location}`),
        task.kind !== 'todo' && h('span', { class: 'badge' }, KIND_LABEL[task.kind]),
        task.remind_min != null && h('span', {}, '⏰'),
        task.tags.map((t) => h('span', { class: 'badge' }, t)))),
    task.source_image && h('img', { class: 'task-thumb', src: `/api/images/${task.source_image}`, alt: '来源截图', loading: 'lazy' }));
}

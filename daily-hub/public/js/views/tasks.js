import { h, mount, debounce } from '../dom.js';
import { api } from '../api.js';
import { toast, toastError } from '../toast.js';
import { notifyChange } from '../store.js';
import { localYmd, addDays } from '/shared/dates.js';
import { friendlyDate, groupBy } from '../format.js';
import { taskItem } from '../components/task-item.js';
import { editTask } from '../components/task-form.js';
import { importTasks } from '../components/import-tasks.js';

export const title = '备忘';

const FILTERS = [['open', '待办'], ['today', '今天及逾期'], ['week', '7 天内'], ['nodate', '无日期'], ['done', '已完成']];
let filter = 'open';

function queryFor(f, q) {
  const today = localYmd();
  const params = new URLSearchParams({ done: f === 'done' ? 'true' : 'false' });
  if (f === 'today') params.set('to', today);
  if (f === 'week') params.set('to', addDays(today, 7));
  if (q) params.set('q', q);
  return params;
}

function list(tasks) {
  const today = localYmd();
  if (!tasks.length) {
    return h('div', { class: 'empty' }, h('span', { class: 'big' }, filter === 'done' ? '🗒️' : '✨'),
      filter === 'done' ? '还没有已完成的备忘' : '这里空空的',
      filter !== 'done' && h('div', { class: 'row', style: { 'justify-content': 'center', 'margin-top': '12px' } },
        h('button', { class: 'btn primary', type: 'button', onclick: () => importTasks() }, '📷 识别截图'),
        h('button', { class: 'btn', type: 'button', onclick: () => editTask() }, '＋ 添加')));
  }
  const shown = filter === 'done' ? [...tasks].reverse() : tasks;
  return h('div', {}, [...groupBy(shown, (t) => t.date ?? '').entries()].map(([date, items]) =>
    h('section', { class: 'stack', style: { 'margin-bottom': '14px' } },
      h('h2', { class: 'group-title' }, date ? friendlyDate(date, today) : '无日期',
        date && date < today && filter !== 'done' && h('span', { class: 'badge bad' }, '已过期')),
      h('div', {}, items.map((t) => taskItem(t, { onOpen: (x) => editTask(x), showDate: false }))))));
}

export async function render(container, ctx) {
  const search = h('input', { type: 'search', placeholder: '搜索标题、地点、备注', 'aria-label': '搜索备忘', autocomplete: 'off' });
  const chips = h('div', { class: 'chips', role: 'group', 'aria-label': '筛选' });
  const out = h('div', {});
  const clear = h('button', {
    class: 'btn danger small', type: 'button', hidden: true,
    onclick: async () => {
      if (!confirm('清空所有已完成的备忘？此操作无法撤销。')) return;
      try {
        const { removed } = await api.post('/api/tasks/clear-done');
        toast(`已清除 ${removed} 条`);
        notifyChange();
      } catch (err) { toastError(err); }
    },
  }, '清空已完成');
  mount(container, h('div', { class: 'stack' }, search, chips, clear, out));
  let seq = 0;

  function drawChips() {
    mount(chips, FILTERS.map(([key, label]) => h('button', {
      class: 'chip', type: 'button', 'aria-pressed': String(key === filter),
      onclick: () => { filter = key; drawChips(); load(); },
    }, label)));
    clear.hidden = filter !== 'done';
  }

  async function load() {
    const mine = ++seq;
    let tasks = await api.get(`/api/tasks?${queryFor(filter, search.value.trim())}`, { signal: ctx.signal });
    if (filter === 'nodate') tasks = tasks.filter((t) => !t.date);
    if (mine === seq) mount(out, list(tasks));
  }

  search.addEventListener('input', debounce(() => load().catch(() => {}), 250));
  ctx.onChange(() => load().catch(() => {}));
  drawChips();
  await load();
}

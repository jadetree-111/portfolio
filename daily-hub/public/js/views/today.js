import { h, mount } from '../dom.js';
import { api } from '../api.js';
import { state, scheduleSettings, holidayMap } from '../store.js';
import { localYmd, addDays, weekdayLabel, weekNumber } from '/shared/dates.js';
import { lunarText } from '/shared/lunar.js';
import { coursesOn } from '/shared/schedule.js';
import { describeWeather } from '/shared/weather-codes.js';
import { courseRow } from '../components/course-row.js';
import { taskItem } from '../components/task-item.js';
import { editTask } from '../components/task-form.js';
import { importTasks } from '../components/import-tasks.js';

export const title = '今天';

const section = (heading, count, ...children) => h('section', { class: 'stack' },
  h('h2', { class: 'group-title' }, heading, count != null && h('span', { class: 'badge' }, count)), ...children);

function hero(today, holiday) {
  const { semester_start: start, show_lunar: lunar } = state.settings;
  const week = start ? weekNumber(today, start) : null;
  return h('div', { class: 'card stack' },
    h('div', { class: 'hero-line' },
      h('h2', {}, `${+today.slice(5, 7)}月${+today.slice(8)}日`), h('span', {}, weekdayLabel(today)),
      lunar && h('span', { class: 'muted' }, lunarText(today)),
      holiday && h('span', { class: `badge ${holiday.off ? 'bad' : 'warn'}` }, `${holiday.name} · ${holiday.off ? '休' : '补班'}`),
      week >= 1 && h('span', { class: 'badge ok' }, `第 ${week} 周`)),
    h('div', { class: 'row' },
      h('button', { class: 'btn primary grow', type: 'button', onclick: () => importTasks() }, '📷 识别截图'),
      h('button', { class: 'btn grow', type: 'button', onclick: () => editTask() }, '＋ 手动添加')));
}

function loadWeather(slot, signal) {
  api.get('/api/weather', { signal }).then((w) => {
    const now = describeWeather(w.current.code, w.current.isDay);
    const day = w.daily[0];
    const tip = w.tips[0];
    mount(slot,
      h('div', { class: 'w-now' },
        h('span', { class: 'w-icon', 'aria-hidden': 'true' }, now.icon),
        h('div', { class: 'grow' },
          h('div', { class: 'hero-line' }, h('span', { class: 'w-temp' }, `${Math.round(w.current.temp)}°`), h('span', {}, now.text)),
          h('div', { class: 'small muted' }, `${w.city} · ${Math.round(day.min)}° ~ ${Math.round(day.max)}° · 降水 ${day.pop ?? 0}%`))),
      tip && h('p', { class: 'small' }, `${tip.icon} ${tip.title}：${tip.text}`));
  }).catch((err) => {
    if (err.name !== 'AbortError') mount(slot, h('span', { class: 'muted' }, '天气暂时不可用，点此重试'));
  });
}

export async function render(container, ctx) {
  const weatherSlot = h('a', { class: 'card stack', href: '#/weather' }, h('span', { class: 'muted' }, '天气加载中…'));
  const body = h('div', { class: 'stack' });
  mount(container, body);
  loadWeather(weatherSlot, ctx.signal);
  let seq = 0;

  async function refresh() {
    const mine = ++seq;
    const today = localYmd();
    const [tasks, courses, holidays] = await Promise.all([
      api.get('/api/tasks?done=false', { signal: ctx.signal }),
      api.get('/api/courses', { signal: ctx.signal }),
      holidayMap(+today.slice(0, 4)),
    ]);
    if (mine !== seq) return;
    const soonEnd = addDays(today, 7);
    const overdue = tasks.filter((t) => t.date && t.date < today);
    const todays = tasks.filter((t) => t.date === today);
    const soon = tasks.filter((t) => t.date > today && t.date <= soonEnd);
    const undated = tasks.filter((t) => !t.date);
    const classes = coursesOn(courses, today, scheduleSettings());
    const row = (t) => taskItem(t, { onOpen: (x) => editTask(x), showDate: t.date !== today });
    mount(body, hero(today, holidays.get(today)), weatherSlot,
      classes.length > 0 && section('今天的课', classes.length, classes.map((c) => courseRow(c))),
      overdue.length > 0 && section('已过期', overdue.length, overdue.map(row)),
      section('今天的安排', todays.length, todays.length ? todays.map(row) : h('p', { class: 'empty' }, '今天没有安排 🎉')),
      soon.length > 0 && section('未来 7 天', soon.length, soon.map(row)),
      undated.length > 0 && section('无日期待办', undated.length, undated.slice(0, 8).map(row)));
  }
  ctx.onChange(() => refresh().catch(() => {}));
  await refresh();
}

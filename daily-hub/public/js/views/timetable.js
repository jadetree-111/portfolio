import { h, mount } from '../dom.js';
import { api } from '../api.js';
import { state, scheduleSettings } from '../store.js';
import { localYmd, addDays, mondayOf, weekNumber, WEEKDAY_CN } from '/shared/dates.js';
import { coursesOn, periodSpan, assignLanes, DEFAULT_PERIODS } from '/shared/schedule.js';
import { hueOf, timeRange } from '../format.js';
import { editCourse } from '../components/course-form.js';
import { importTimetable } from '../components/import-timetable.js';

export const title = '课表';

let monday = null; // the week being viewed survives tab switches

function courseButton(item, rows) {
  const { course: c, from, to, lane } = item;
  const text = [c.name, c.location, c.teacher].filter(Boolean).join('，');
  return h('button', {
    class: 'tt-course', type: 'button', style: { 'grid-row': `${from} / ${Math.min(to, rows) + 1}`, 'grid-column': lane + 1, '--hue': hueOf(c.name) },
    'aria-label': `周${WEEKDAY_CN[c.weekday - 1]} ${timeRange(c.start, c.end)} ${text}`,
    onclick: () => editCourse(c.raw),
  }, h('b', {}, c.name), c.location && h('span', {}, c.location), c.teacher && h('span', {}, c.teacher));
}

function weekGrid(courses, today) {
  const settings = scheduleSettings();
  const periods = settings.periods?.length ? settings.periods : DEFAULT_PERIODS;
  const dates = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const perDay = dates.map((d) => coursesOn(courses, d, settings)
    .map((c) => ({ course: { ...c, raw: courses.find((x) => x.id === c.id) }, ...periodSpan(c, periods) }))
    .filter((x) => x.from));
  const days = courses.some((c) => c.weekday >= 6) ? 7 : 5;
  const rows = Math.max(8, ...perDay.flat().map((x) => x.to));

  const cols = dates.slice(0, days).map((date, i) => {
    const lanes = assignLanes(perDay[i]);
    return h('div', {
      class: 'tt-day',
      style: { 'grid-column': i + 2, 'grid-row': `2 / span ${rows}`, 'grid-template-rows': `repeat(${rows}, var(--row))`, 'grid-template-columns': `repeat(${lanes}, minmax(0, 1fr))` },
    },
    Array.from({ length: rows }, (_, r) => h('div', { class: 'tt-slot', style: { 'grid-row': r + 1, 'grid-column': '1 / -1' } })),
    perDay[i].map((item) => courseButton(item, rows)));
  });

  return h('div', { class: 'tt-wrap card' }, h('div', {
    class: 'tt-grid', style: { 'grid-template-columns': `28px repeat(${days}, minmax(0, 1fr))`, 'grid-template-rows': `auto repeat(${rows}, var(--row))` },
  },
  h('div', { class: 'tt-h' }),
  dates.slice(0, days).map((d, i) => h('div', { class: `tt-h${d === today ? ' today' : ''}`, style: { 'grid-row': 1, 'grid-column': i + 2 } },
    `周${WEEKDAY_CN[i]}`, h('div', { class: 'small' }, `${+d.slice(5, 7)}/${+d.slice(8)}`))),
  Array.from({ length: rows }, (_, r) => {
    const p = periods.find((x) => x.n === r + 1);
    return h('div', { class: 'tt-p', style: { 'grid-row': r + 2, 'grid-column': 1 } }, h('b', {}, r + 1), p && h('span', {}, p.start));
  }),
  cols));
}

export async function render(container, ctx) {
  const today = localYmd();
  monday ??= mondayOf(today);
  const body = h('div', { class: 'stack' });
  mount(container, body);
  let seq = 0;

  async function load() {
    const mine = ++seq;
    const courses = await api.get('/api/courses', { signal: ctx.signal });
    if (mine !== seq) return;
    const week = state.settings.semester_start ? weekNumber(monday, state.settings.semester_start) : null;
    const move = (days) => { monday = addDays(monday, days); load(); };
    const bar = h('div', { class: 'row wrap between' },
      h('div', { class: 'row' },
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': '上一周', onclick: () => move(-7) }, '‹'),
        h('div', { class: 'center' }, h('strong', {}, `${+monday.slice(5, 7)}月${+monday.slice(8)}日起`),
          week >= 1 && h('div', { class: 'small muted' }, `第 ${week} 周`)),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': '下一周', onclick: () => move(7) }, '›')),
      h('div', { class: 'row' },
        h('button', { class: 'btn small', type: 'button', onclick: () => { monday = mondayOf(today); load(); } }, '本周'),
        h('button', { class: 'btn small', type: 'button', onclick: () => editCourse() }, '＋ 课程'),
        h('button', { class: 'btn small primary', type: 'button', onclick: () => importTimetable() }, '📷 识别')));
    if (!courses.length) {
      return mount(body, bar, h('div', { class: 'empty card' }, h('span', { class: 'big' }, '🎓'), '还没有课表',
        h('p', { class: 'small' }, '上传课表截图或照片，AI 会自动识别课程、节次和周次'),
        h('button', { class: 'btn primary', type: 'button', onclick: () => importTimetable() }, '📷 识别课表图片')));
    }
    mount(body, bar, weekGrid(courses, today),
      !state.settings.semester_start && courses.some((c) => c.weeks.length) &&
        h('p', { class: 'small card' }, '提示：在「设置」里填写开学第一天，课表才能按单双周、第几周正确显示。'));
  }
  ctx.onChange(() => load().catch(() => {}));
  await load();
}

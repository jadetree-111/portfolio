import { h, mount } from '../dom.js';
import { api } from '../api.js';
import { state, scheduleSettings, holidayMap } from '../store.js';
import { monthGrid, shiftMonth, localYmd, weekdayLabel, WEEKDAY_CN } from '/shared/dates.js';
import { dayLabel, lunarText, festivalsOf } from '/shared/lunar.js';
import { coursesOn } from '/shared/schedule.js';
import { taskItem } from '../components/task-item.js';
import { courseRow } from '../components/course-row.js';
import { editTask } from '../components/task-form.js';
import { editCourse } from '../components/course-form.js';

export const title = '日历';

let cursor = null; // { year, month } survives tab switches
let selected = null;

export async function render(container, ctx) {
  const today = localYmd();
  cursor ??= { year: +today.slice(0, 4), month: +today.slice(5, 7) };
  selected ??= today;
  const head = h('div', { class: 'cal-head' });
  const grid = h('div', { class: 'cal-grid' });
  const detail = h('section', { class: 'stack' });
  mount(container, h('div', { class: 'stack' }, head, h('div', { class: 'card' }, grid), detail));
  let data = null;
  let seq = 0;

  const go = (delta) => {
    cursor = shiftMonth(cursor.year, cursor.month, delta);
    selected = `${cursor.year}-${String(cursor.month).padStart(2, '0')}-01`;
    load();
  };
  const jumpToday = () => {
    cursor = { year: +today.slice(0, 4), month: +today.slice(5, 7) };
    selected = today;
    load();
  };

  async function load() {
    const mine = ++seq;
    const weeks = monthGrid(cursor.year, cursor.month, state.settings.week_start);
    const days = weeks.flat();
    const years = [...new Set([+days[0].slice(0, 4), +days.at(-1).slice(0, 4)])];
    const [tasks, courses, ...maps] = await Promise.all([
      api.get(`/api/tasks?from=${days[0]}&to=${days.at(-1)}`, { signal: ctx.signal }),
      api.get('/api/courses', { signal: ctx.signal }),
      ...years.map((y) => holidayMap(y)),
    ]);
    if (mine !== seq) return;
    data = { weeks, tasks, courses, holidays: new Map(maps.flatMap((m) => [...m])) };
    draw();
  }

  function cell(ymd) {
    const open = data.tasks.filter((t) => t.date === ymd && !t.done);
    const classes = data.courses.length ? coursesOn(data.courses, ymd, scheduleSettings()) : [];
    const label = state.settings.show_lunar ? dayLabel(ymd) : { text: '', kind: 'lunar' };
    const hol = data.holidays.get(ymd);
    const parts = [`${+ymd.slice(5, 7)}月${+ymd.slice(8)}日`, weekdayLabel(ymd), open.length && `${open.length} 项备忘`, classes.length && `${classes.length} 节课`, hol && `${hol.name}${hol.off ? '休息' : '补班'}`];
    return h('button', {
      class: `cal-cell${+ymd.slice(5, 7) !== cursor.month ? ' other' : ''}${ymd === today ? ' today' : ''}${ymd === selected ? ' selected' : ''}`,
      type: 'button', 'aria-pressed': String(ymd === selected), 'aria-current': ymd === today ? 'date' : null,
      'aria-label': parts.filter(Boolean).join('，'),
      onclick: () => { selected = ymd; draw(); },
    },
    hol && h('span', { class: `cal-tag${hol.off ? ' off' : ''}`, 'aria-hidden': 'true' }, hol.off ? '休' : '班'),
    h('span', { class: 'cal-num' }, +ymd.slice(8)),
    h('span', { class: `cal-sub ${label.kind}`, 'aria-hidden': 'true' }, label.text),
    h('span', { class: 'dots', 'aria-hidden': 'true' },
      open.some((t) => t.kind === 'deadline') && h('i', { class: 'dot deadline' }),
      open.some((t) => t.kind !== 'deadline') && h('i', { class: 'dot' }),
      classes.length > 0 && h('i', { class: 'dot course' })));
  }

  function drawDetail() {
    const dayTasks = data.tasks.filter((t) => t.date === selected);
    const classes = coursesOn(data.courses, selected, scheduleSettings());
    const hol = data.holidays.get(selected);
    const sub = [state.settings.show_lunar && `农历${lunarText(selected)}`, ...festivalsOf(selected),
      hol && `${hol.name}${hol.off ? '（放假）' : '（补班）'}`].filter(Boolean).join(' · ');
    mount(detail,
      h('div', { class: 'row between' },
        h('div', {}, h('h2', {}, `${+selected.slice(5, 7)}月${+selected.slice(8)}日 ${weekdayLabel(selected)}${selected === today ? ' · 今天' : ''}`),
          sub && h('p', { class: 'small muted' }, sub)),
        h('button', { class: 'btn small primary', type: 'button', onclick: () => editTask(null, { date: selected }) }, '＋ 添加')),
      classes.map((c) => courseRow(c, { onOpen: () => editCourse(data.courses.find((x) => x.id === c.id)) })),
      dayTasks.map((t) => taskItem(t, { onOpen: (x) => editTask(x), showDate: false })),
      !classes.length && !dayTasks.length && h('p', { class: 'empty' }, '这一天没有安排'));
  }

  function draw() {
    const names = state.settings.week_start === 7 ? ['日', ...WEEKDAY_CN.slice(0, 6)] : WEEKDAY_CN;
    mount(head,
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': '上个月', onclick: () => go(-1) }, '‹'),
      h('h2', {}, `${cursor.year}年${cursor.month}月`),
      h('div', { class: 'row' },
        h('button', { class: 'btn small', type: 'button', onclick: jumpToday }, '今天'),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': '下个月', onclick: () => go(1) }, '›')));
    mount(grid, names.map((n) => h('div', { class: 'cal-dow', 'aria-hidden': 'true' }, n)), data.weeks.flat().map(cell));
    drawDetail();
  }

  ctx.onChange(() => load().catch(() => {}));
  await load();
}

import { h } from '../dom.js';
import { api } from '../api.js';
import { openSheet } from '../sheet.js';
import { toast, toastError } from '../toast.js';
import { notifyChange } from '../store.js';
import { parseWeeksText, formatWeeks } from '/shared/schedule.js';
import { WEEKDAY_CN } from '/shared/dates.js';

const field = (label, control, cls = '') => h('label', { class: `field ${cls}`.trim() }, label, control);
const num = (el) => (el.value === '' ? null : Number(el.value));
const periodInput = (value, label) => h('input', { type: 'number', min: 1, max: 20, inputmode: 'numeric', value: value ?? '', 'aria-label': label });

/** Course editor sheet. Resolves 'saved' | 'deleted' | undefined. */
export function editCourse(course = null, defaults = {}) {
  const c = { name: '', teacher: '', location: '', weekday: 1, start_period: null, end_period: null, start_time: '', end_time: '', weeks: [], ...defaults, ...course };
  return openSheet(course ? '编辑课程' : '添加课程', (close) => {
    const name = h('input', { type: 'text', value: c.name, maxlength: 60, required: true, autocomplete: 'off' });
    const teacher = h('input', { type: 'text', value: c.teacher, maxlength: 40, autocomplete: 'off' });
    const place = h('input', { type: 'text', value: c.location, maxlength: 60, autocomplete: 'off', placeholder: '教室 / 楼号' });
    const weekday = h('select', { value: String(c.weekday) }, WEEKDAY_CN.map((d, i) => h('option', { value: i + 1 }, `周${d}`)));
    const startP = periodInput(c.start_period, '开始节次');
    const endP = periodInput(c.end_period, '结束节次');
    const startT = h('input', { type: 'time', value: c.start_time ?? '' });
    const endT = h('input', { type: 'time', value: c.end_time ?? '' });
    const weeks = h('input', { type: 'text', value: c.weeks.length ? formatWeeks(c.weeks).replace(/周$/, '') : '', placeholder: '如 1-16、1-15单、2-16双；留空 = 每周', autocomplete: 'off' });
    const save = h('button', { class: 'btn primary grow', type: 'submit' }, '保存');

    return h('form', {
      class: 'stack',
      onsubmit: async (e) => {
        e.preventDefault();
        const parsed = parseWeeksText(weeks.value);
        if (parsed === null) return toast('周次格式不对，例如 1-16、1-15单、2-16双、1-8,10-16', { kind: 'error' });
        const body = {
          name: name.value, teacher: teacher.value, location: place.value, weekday: Number(weekday.value),
          start_period: num(startP), end_period: num(endP), start_time: startT.value || null, end_time: endT.value || null, weeks: parsed,
        };
        save.disabled = true;
        try {
          if (course) await api.patch(`/api/courses/${course.id}`, body);
          else await api.post('/api/courses', body);
          notifyChange();
          toast('已保存', { kind: 'success' });
          close('saved');
        } catch (err) { toastError(err); } finally { save.disabled = false; }
      },
    },
    field('课程名', name),
    h('div', { class: 'fields' }, field('星期', weekday), field('教师', teacher)),
    h('div', { class: 'fields' }, field('开始节次', startP), field('结束节次', endP)),
    h('p', { class: 'small muted' }, '节次和具体时间填一种即可；都填时以具体时间为准。'),
    h('div', { class: 'fields' }, field('上课时间', startT), field('下课时间', endT)),
    field('地点', place),
    field('上课周次', weeks),
    h('div', { class: 'row' },
      course && h('button', {
        class: 'btn danger', type: 'button',
        onclick: async () => {
          if (!confirm(`删除「${course.name}」？`)) return;
          try { await api.del(`/api/courses/${course.id}`); notifyChange(); close('deleted'); } catch (err) { toastError(err); }
        },
      }, '删除'),
      save));
  });
}

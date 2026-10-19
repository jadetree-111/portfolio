import { h, mount } from '../dom.js';
import { api } from '../api.js';
import { openSheet } from '../sheet.js';
import { toast, toastError } from '../toast.js';
import { notifyChange, saveSettings, state } from '../store.js';
import { formatWeeks } from '/shared/schedule.js';
import { WEEKDAY_CN } from '/shared/dates.js';
import { createPicker } from './picker.js';

function describe(c) {
  const when = c.start_period
    ? `第${c.start_period}${c.end_period > c.start_period ? `-${c.end_period}` : ''}节`
    : [c.start_time, c.end_time].filter(Boolean).join('–');
  return [`周${WEEKDAY_CN[c.weekday - 1]}`, when, c.weeks.length ? formatWeeks(c.weeks) : '每周', c.location, c.teacher].filter(Boolean).join(' · ');
}

function courseRow(c) {
  const on = h('input', { class: 'task-check', type: 'checkbox', checked: true, 'aria-label': `导入 ${c.name}` });
  const name = h('input', { type: 'text', value: c.name, maxlength: 60, 'aria-label': '课程名' });
  const el = h('div', { class: 'review-row stack' }, h('div', { class: 'row' }, on, name), h('p', { class: 'small muted' }, describe(c)));
  on.addEventListener('change', () => el.classList.toggle('off', !on.checked));
  return { el, read: () => (on.checked ? { ...c, name: name.value } : null) };
}

const segmented = (options, value, onPick) => {
  const wrap = h('div', { class: 'seg', role: 'group' });
  const draw = () => wrap.replaceChildren(...options.map(([v, label]) =>
    h('button', { type: 'button', 'aria-pressed': String(v === value), onclick: () => { value = v; onPick(v); draw(); } }, label)));
  draw();
  return wrap;
};

/** "Timetable picture -> courses" sheet. Resolves 'saved' once courses were imported. */
export function importTimetable() {
  return openSheet('识别课表', (close, dialog) => {
    const controller = new AbortController();
    const picker = createPicker({ label: '选择课表截图或照片' });
    dialog.addEventListener('close', () => { controller.abort(); picker.dispose(); });
    const status = h('p', { class: 'small muted', role: 'status' });
    const go = h('button', { class: 'btn primary block', type: 'button', onclick: run }, '开始识别');
    const stage = h('div', { class: 'stack' });
    const inputStage = () => stage.replaceChildren(
      h('p', { class: 'small muted' }, '支持教务系统截图、课表 App 截图、表格或手写课表的照片。多张图会按一份课表合并识别。'), picker.el, go, status);

    async function run() {
      if (!picker.files().length) return toast('请先选择课表图片', { kind: 'error' });
      go.disabled = true;
      try {
        const up = await picker.upload((s) => { status.textContent = s; }, controller.signal);
        status.textContent = '正在识别课表，通常需要 20–60 秒…';
        const sourceImage = up.ids.length === 1 ? up.ids[0] : null;
        const result = await api.post('/api/ai/timetable', { imageIds: up.ids, stitched: up.stitched }, { signal: controller.signal });
        const existing = (await api.get('/api/courses', { signal: controller.signal }).catch(() => [])).length;
        review(result, sourceImage, existing);
      } catch (err) {
        if (err.name !== 'AbortError') toastError(err);
        status.textContent = '';
      } finally { go.disabled = false; }
    }

    function review(result, sourceImage, existing) {
      const rows = result.courses.map(courseRow);
      let mode = 'replace';
      const keepPeriods = h('input', { type: 'checkbox', checked: result.periods.length > 0 });
      const start = h('input', { type: 'date', value: state.settings.semester_start ?? '' });
      const needStart = !state.settings.semester_start && result.courses.some((c) => c.weeks.length);
      const save = h('button', {
        class: 'btn primary grow', type: 'button', disabled: !rows.length,
        onclick: async () => {
          const courses = rows.map((r) => r.read()).filter(Boolean).map((c) => ({ ...c, source_image: sourceImage }));
          if (!courses.length) return toast('没有选中任何课程', { kind: 'error' });
          if (existing > 0 && mode === 'replace' && !confirm(`这会替换现有的 ${existing} 条课程记录，确定吗？`)) return;
          save.disabled = true;
          try {
            const settings = {};
            if (result.periods.length && keepPeriods.checked) settings.periods = result.periods;
            if (needStart && start.value) settings.semester_start = start.value;
            if (Object.keys(settings).length) await saveSettings(settings);
            const res = await api.post('/api/courses/import', { courses, mode });
            notifyChange();
            toast(`已导入 ${res.created.length} 门课程`, { kind: 'success' });
            close('saved');
          } catch (err) { toastError(err); save.disabled = false; }
        },
      }, '导入选中的课程');
      mount(stage,
        h('p', { class: 'small muted' }, rows.length ? `识别到 ${rows.length} 条课程记录，请核对（可改课程名，其余导入后点课程再改）` : '没有识别到课程'),
        result.warnings.map((w) => h('p', { class: 'small', style: { color: 'var(--warn)' } }, `⚠ ${w}`)),
        rows.map((r) => r.el),
        rows.length > 0 && existing > 0 && segmented([['replace', '替换现有课表'], ['append', '追加到现有课表']], mode, (v) => { mode = v; }),
        result.periods.length > 0 && h('label', { class: 'row' }, keepPeriods, `同时使用图上的节次时间表（共 ${result.periods.length} 节）`),
        needStart && h('label', { class: 'field' }, '开学第一天（用于计算第几周、单双周；可稍后在设置里填）', start),
        h('div', { class: 'row sticky-actions' }, h('button', { class: 'btn', type: 'button', onclick: inputStage }, '重新识别'), save));
    }

    inputStage();
    return stage;
  }, { wide: true });
}

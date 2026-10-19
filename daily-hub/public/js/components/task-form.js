import { h } from '../dom.js';
import { api } from '../api.js';
import { openSheet } from '../sheet.js';
import { toast, toastError } from '../toast.js';
import { notifyChange, state } from '../store.js';
import { REMIND_OPTIONS, KIND_LABEL } from '../format.js';
import { localYmd, addDays } from '/shared/dates.js';

const field = (label, control, cls = '') => h('label', { class: `field ${cls}`.trim() }, label, control);
const splitTags = (s) => s.split(/[,，、\s]+/).map((t) => t.trim()).filter(Boolean);

/** Opens the task editor. Resolves with 'saved', 'deleted', or undefined when dismissed. */
export function editTask(task = null, defaults = {}) {
  const t = {
    title: '', details: '', kind: 'todo', date: '', time: '', end_time: '', location: '',
    priority: 'normal', tags: [], remind_min: null, ...defaults, ...task,
  };
  return openSheet(task ? '编辑备忘' : '添加备忘', (close) => {
    const title = h('input', { type: 'text', value: t.title, maxlength: 120, required: true, autocomplete: 'off', placeholder: '要做什么？' });
    const date = h('input', { type: 'date', value: t.date ?? '' });
    const time = h('input', { type: 'time', value: t.time ?? '' });
    const endTime = h('input', { type: 'time', value: t.end_time ?? '' });
    const place = h('input', { type: 'text', value: t.location, maxlength: 120, autocomplete: 'off', placeholder: '地点（可选）' });
    const kind = h('select', { value: t.kind }, Object.entries(KIND_LABEL).map(([v, l]) => h('option', { value: v }, l)));
    const remind = h('select', { value: t.remind_min == null ? '' : String(t.remind_min) },
      REMIND_OPTIONS.map(([v, l]) => h('option', { value: v ?? '' }, l)));
    const important = h('input', { type: 'checkbox', checked: t.priority === 'high' });
    const tags = h('input', { type: 'text', value: t.tags.join(' '), placeholder: '用空格分隔', autocomplete: 'off' });
    const details = h('textarea', { rows: 3, maxlength: 2000, placeholder: '备注（可选）' }, t.details);
    const save = h('button', { class: 'btn primary grow', type: 'submit' }, '保存');

    let remindTouched = Boolean(task);
    remind.addEventListener('change', () => { remindTouched = true; });
    time.addEventListener('input', () => {
      if (remindTouched) return;
      const def = state.settings?.remind_default_min;
      remind.value = time.value && def != null ? String(def) : '';
    });

    const quick = [['今天', 0], ['明天', 1], ['后天', 2]].map(([label, n]) =>
      h('button', { class: 'chip', type: 'button', onclick: () => { date.value = addDays(localYmd(), n); } }, label));

    const body = () => ({
      title: title.value, details: details.value, kind: kind.value, location: place.value,
      date: date.value || null, time: date.value && time.value ? time.value : null,
      end_time: date.value && time.value && endTime.value ? endTime.value : null,
      priority: important.checked ? 'high' : 'normal', tags: splitTags(tags.value),
      remind_min: time.value && date.value && remind.value !== '' ? Number(remind.value) : null,
    });

    const form = h('form', {
      class: 'stack',
      onsubmit: async (e) => {
        e.preventDefault();
        if (time.value && !date.value) {
          toast('设置了时间，请同时选择日期', { kind: 'error' });
          return date.focus();
        }
        save.disabled = true;
        try {
          if (task) await api.patch(`/api/tasks/${task.id}`, body());
          else await api.post('/api/tasks', body());
          notifyChange();
          toast(task ? '已保存' : '已添加', { kind: 'success' });
          close('saved');
        } catch (err) {
          toastError(err);
        } finally {
          save.disabled = false;
        }
      },
    },
    field('标题', title),
    h('div', { class: 'chips' }, quick),
    h('div', { class: 'fields' }, field('日期', date), field('类型', kind), field('开始时间', time), field('结束时间', endTime)),
    field('地点', place),
    h('div', { class: 'fields' }, field('提醒', remind), field('标签', tags)),
    h('label', { class: 'row' }, important, '标记为重要'),
    field('备注', details),
    task?.source_image && h('a', { href: `/api/images/${task.source_image}`, target: '_blank', rel: 'noopener' }, '查看来源截图'),
    task?.source_text && h('p', { class: 'small muted' }, `识别依据：${task.source_text}`),
    h('div', { class: 'row' },
      task && h('button', {
        class: 'btn danger', type: 'button',
        onclick: async () => {
          if (!confirm(`删除「${task.title}」？`)) return;
          try {
            await api.del(`/api/tasks/${task.id}`);
            notifyChange();
            toast('已删除');
            close('deleted');
          } catch (err) { toastError(err); }
        },
      }, '删除'),
      save));
    queueMicrotask(() => { if (!task) title.focus(); });
    return form;
  });
}

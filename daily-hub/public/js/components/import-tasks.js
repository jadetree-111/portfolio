import { h, mount } from '../dom.js';
import { api } from '../api.js';
import { openSheet } from '../sheet.js';
import { toast, toastError } from '../toast.js';
import { notifyChange, state } from '../store.js';
import { KIND_LABEL } from '../format.js';
import { createPicker } from './picker.js';

/** One editable row of the AI preview; read() returns the task body, or null when unticked. */
function reviewRow(t, sourceImage) {
  const on = h('input', { class: 'task-check', type: 'checkbox', checked: true, 'aria-label': '保存这一条' });
  const title = h('input', { type: 'text', value: t.title, maxlength: 120, 'aria-label': '标题' });
  const date = h('input', { type: 'date', value: t.date ?? '', 'aria-label': '日期' });
  const time = h('input', { type: 'time', value: t.time ?? '', 'aria-label': '开始时间' });
  const place = h('input', { type: 'text', value: t.location, maxlength: 120, placeholder: '地点', 'aria-label': '地点' });
  const el = h('div', { class: 'review-row stack' },
    h('div', { class: 'row' }, on, title),
    h('div', { class: 'fields' }, date, time),
    place,
    h('div', { class: 'row wrap small muted' },
      h('span', { class: 'badge' }, KIND_LABEL[t.kind]),
      t.priority === 'high' && h('span', { class: 'badge bad' }, '重要'),
      t.source_text && h('span', {}, `原文：${t.source_text}`)));
  on.addEventListener('change', () => el.classList.toggle('off', !on.checked));
  const defaultRemind = state.settings?.remind_default_min ?? null;
  return {
    el,
    read: () => {
      if (!on.checked) return null;
      const timed = Boolean(date.value && time.value);
      return {
        title: title.value, details: t.details, kind: t.kind, location: place.value, priority: t.priority, tags: t.tags,
        date: date.value || null, time: timed ? time.value : null,
        end_time: timed && t.end_time && t.end_time > time.value ? t.end_time : null,
        remind_min: timed ? defaultRemind : null,
        source_text: t.source_text, source_image: sourceImage,
      };
    },
  };
}

/** Opens the "screenshot / text -> tasks" sheet. Resolves 'saved' when something was added. */
export function importTasks({ text: initialText = '' } = {}) {
  return openSheet('智能识别备忘', (close, dialog) => {
    const controller = new AbortController();
    const picker = createPicker({ label: '选择截图或照片' });
    dialog.addEventListener('close', () => { controller.abort(); picker.dispose(); });

    const text = h('textarea', { rows: 3, maxlength: 4000, placeholder: '也可以直接粘贴文字：群通知、短信、邮件内容…' }, initialText);
    const status = h('p', { class: 'small muted', role: 'status' });
    const notice = h('p', { class: 'card small', hidden: true });
    const go = h('button', { class: 'btn primary block', type: 'button', onclick: run }, '开始识别');
    const stage = h('div', { class: 'stack' });

    api.get('/api/ai/status').then((s) => {
      if (s.configured) return;
      notice.hidden = false;
      notice.textContent = '还没有配置 AI 密钥，暂时只能手动添加。把 ANTHROPIC_API_KEY（或 ANTHROPIC_BASE_URL + ANTHROPIC_AUTH_TOKEN）写进 .env 后重启即可。';
    }).catch(() => {});

    const inputStage = () => stage.replaceChildren(notice, picker.el, text, go, status);

    async function run() {
      if (!picker.files().length && !text.value.trim()) return toast('请先选择图片，或粘贴一段文字', { kind: 'error' });
      go.disabled = true;
      try {
        const up = picker.files().length ? await picker.upload((s) => { status.textContent = s; }, controller.signal) : { ids: [], stitched: false };
        status.textContent = '正在识别，通常需要 10–40 秒，请稍候…';
        const result = await api.post('/api/ai/tasks', { imageIds: up.ids, text: text.value, stitched: up.stitched }, { signal: controller.signal });
        review(result, up.ids.length === 1 ? up.ids[0] : null);
      } catch (err) {
        if (err.name !== 'AbortError') toastError(err);
        status.textContent = '';
      } finally {
        go.disabled = false;
      }
    }

    function review(result, sourceImage) {
      const rows = result.tasks.map((t) => reviewRow(t, sourceImage));
      const save = h('button', {
        class: 'btn primary grow', type: 'button', disabled: !rows.length,
        onclick: async () => {
          const items = rows.map((r) => r.read()).filter(Boolean);
          if (!items.length) return toast('没有选中任何事项', { kind: 'error' });
          save.disabled = true;
          try {
            const res = await api.post('/api/tasks/batch', { items });
            notifyChange();
            toast(`已添加 ${res.created.length} 条${res.errors.length ? `，${res.errors.length} 条有问题未保存` : ''}`, { kind: 'success' });
            close('saved');
          } catch (err) { toastError(err); save.disabled = false; }
        },
      }, '保存选中的事项');
      mount(stage,
        h('p', { class: 'small muted' }, rows.length ? `识别到 ${rows.length} 条，请核对后保存（识别结果可能有误，尤其是日期）` : '没有识别到可保存的事项'),
        result.notes && h('p', { class: 'card small' }, result.notes),
        result.warnings.map((w) => h('p', { class: 'small', style: { color: 'var(--warn)' } }, `⚠ ${w}`)),
        rows.map((r) => r.el),
        h('div', { class: 'row sticky-actions' }, h('button', { class: 'btn', type: 'button', onclick: inputStage }, '重新识别'), save));
    }

    inputStage();
    return stage;
  }, { wide: true });
}

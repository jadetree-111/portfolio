import { badRequest, notFound } from './http.js';
import { transaction } from './db.js';
import { isImageId } from './images.js';
import { isYmd, isHm } from '../shared/dates.js';

export const KINDS = ['todo', 'event', 'deadline'];
export const PRIORITIES = ['low', 'normal', 'high'];

const squash = (s, max) => String(s ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max);
const oneLine = (s, max) => squash(s, max).replace(/\s+/g, ' ');

/** Cross-field rules, checked on a complete task (new, or an existing one with a patch applied). */
export function assertConsistent(t) {
  if (!t.date && (t.time || t.end_time)) throw badRequest('设置了时间就需要同时设置日期', 'time_needs_date');
  if (!t.date && t.remind_min != null) throw badRequest('提醒需要先设置日期', 'remind_needs_date');
  if (t.remind_min != null && !t.time) throw badRequest('提醒需要先设置具体时间', 'remind_needs_time');
  if (t.end_time && !t.time) throw badRequest('设置了结束时间就需要开始时间', 'end_needs_start');
  if (t.end_time && t.time && t.end_time <= t.time) throw badRequest('结束时间需要晚于开始时间', 'bad_end_time');
}

/** Validate task input field by field. With partial=true only the provided keys are returned. */
export function cleanTask(input, { partial = false } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw badRequest('任务格式不正确');
  const out = {};
  const has = (k) => Object.hasOwn(input, k);

  if (has('title') || !partial) {
    out.title = oneLine(input.title, 120);
    if (!out.title) throw badRequest('标题不能为空', 'title_required');
  }
  if (has('details')) out.details = squash(input.details, 2000);
  if (has('location')) out.location = oneLine(input.location, 120);
  if (has('source_text')) out.source_text = squash(input.source_text, 600);
  if (has('kind')) {
    if (!KINDS.includes(input.kind)) throw badRequest('类型不正确');
    out.kind = input.kind;
  }
  if (has('priority')) {
    if (!PRIORITIES.includes(input.priority)) throw badRequest('优先级不正确');
    out.priority = input.priority;
  }
  for (const key of ['date', 'time', 'end_time']) {
    if (!has(key)) continue;
    const v = input[key] === '' ? null : input[key];
    if (v !== null && !(key === 'date' ? isYmd(v) : isHm(v))) {
      throw badRequest(key === 'date' ? '日期格式应为 YYYY-MM-DD' : '时间格式应为 HH:MM', `bad_${key}`);
    }
    out[key] = v;
  }
  if (has('tags')) {
    if (!Array.isArray(input.tags)) throw badRequest('标签格式不正确');
    out.tags = [...new Set(input.tags.map((t) => oneLine(t, 12)).filter(Boolean))].slice(0, 5);
  }
  if (has('remind_min')) {
    const v = input.remind_min;
    if (v !== null && !(Number.isInteger(v) && v >= 0 && v <= 10080)) throw badRequest('提醒时间不正确');
    out.remind_min = v;
  }
  if (has('done')) out.done = Boolean(input.done);
  if (has('source_image')) out.source_image = isImageId(input.source_image) ? input.source_image : null;
  if (!partial) assertConsistent(out);
  return out;
}

const COLUMNS = ['title', 'details', 'kind', 'date', 'time', 'end_time', 'location', 'priority', 'remind_min', 'source_image', 'source_text'];

const fromRow = (row) => row && { ...row, tags: JSON.parse(row.tags || '[]'), done: Boolean(row.done) };

export function createTaskRepo(db) {
  const get = (id) => fromRow(db.prepare('SELECT * FROM tasks WHERE id = ?').get(id));
  const insert = db.prepare(`INSERT INTO tasks(${COLUMNS.join(',')},tags) VALUES (${COLUMNS.map(() => '?').join(',')},?)`);
  const fill = (t) => [t.title, t.details ?? '', t.kind ?? 'todo', t.date ?? null, t.time ?? null, t.end_time ?? null,
    t.location ?? '', t.priority ?? 'normal', t.remind_min ?? null, t.source_image ?? null, t.source_text ?? ''];
  const create = (task) => get(Number(insert.run(...fill(task), JSON.stringify(task.tags ?? [])).lastInsertRowid));

  return {
    get,
    list({ from, to, done, q, limit = 1000 } = {}) {
      const where = [];
      const args = [];
      if (from) { where.push('date >= ?'); args.push(from); }
      if (to) { where.push('date <= ?'); args.push(to); }
      if (done === true || done === false) { where.push('done = ?'); args.push(done ? 1 : 0); }
      if (q) {
        const like = `%${String(q).replace(/[\\%_]/g, '\\$&')}%`;
        where.push("(title LIKE ? ESCAPE '\\' OR details LIKE ? ESCAPE '\\' OR location LIKE ? ESCAPE '\\')");
        args.push(like, like, like);
      }
      const sql = `SELECT * FROM tasks ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY done, date IS NULL, date, time IS NULL, time, id LIMIT ?`;
      return db.prepare(sql).all(...args, Math.min(limit, 5000)).map(fromRow);
    },
    create,
    createMany: (tasks) => transaction(db, () => tasks.map(create)),
    update(id, patch) {
      const existing = get(id);
      if (!existing) throw notFound('任务不存在');
      assertConsistent({ ...existing, ...patch });
      const sets = [];
      const args = [];
      for (const [key, value] of Object.entries(patch)) {
        if (key === 'tags') { sets.push('tags = ?'); args.push(JSON.stringify(value)); }
        else if (key === 'done') {
          sets.push('done = ?', "done_at = CASE WHEN ? THEN datetime('now') ELSE NULL END");
          args.push(value ? 1 : 0, value ? 1 : 0);
        } else if (COLUMNS.includes(key)) { sets.push(`${key} = ?`); args.push(value); }
      }
      if (sets.length) db.prepare(`UPDATE tasks SET ${sets.join(', ')}, updated_at = datetime('now') WHERE id = ?`).run(...args, id);
      return get(id);
    },
    remove(id) {
      if (!db.prepare('DELETE FROM tasks WHERE id = ?').run(id).changes) throw notFound('任务不存在');
    },
    clearDone: () => Number(db.prepare('DELETE FROM tasks WHERE done = 1').run().changes),
  };
}

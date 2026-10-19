import { badRequest, notFound } from './http.js';
import { transaction } from './db.js';
import { isImageId } from './images.js';
import { isHm } from '../shared/dates.js';

const oneLine = (s, max) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const period = (v, label) => {
  if (v == null || v === '') return null;
  if (!Number.isInteger(v) || v < 1 || v > 20) throw badRequest(`${label}应为 1-20 的整数`);
  return v;
};

export function cleanCourse(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw badRequest('课程格式不正确');
  const name = oneLine(input.name, 60);
  if (!name) throw badRequest('课程名不能为空', 'name_required');
  if (!Number.isInteger(input.weekday) || input.weekday < 1 || input.weekday > 7) throw badRequest('星期应为 1-7');
  const start_period = period(input.start_period, '开始节次');
  const end_period = period(input.end_period, '结束节次') ?? start_period;
  if (start_period && end_period < start_period) throw badRequest('结束节次不能早于开始节次');
  const times = [input.start_time || null, input.end_time || null];
  if (times.some((t) => t && !isHm(t))) throw badRequest('时间格式应为 HH:MM');
  if (times[0] && times[1] && times[1] <= times[0]) throw badRequest('下课时间需要晚于上课时间');
  if (!start_period && !times[0]) throw badRequest('请填写节次或上课时间', 'time_required');
  const weeks = Array.isArray(input.weeks) ? input.weeks : [];
  if (weeks.length > 60 || weeks.some((w) => !Number.isInteger(w) || w < 1 || w > 60)) throw badRequest('周次不正确');
  return {
    name, weekday: input.weekday, start_period, end_period: start_period ? end_period : null,
    teacher: oneLine(input.teacher, 40), location: oneLine(input.location, 60),
    start_time: times[0], end_time: times[1],
    weeks: [...new Set(weeks)].sort((a, b) => a - b),
    source_image: isImageId(input.source_image) ? input.source_image : null,
  };
}

const fromRow = (row) => row && { ...row, weeks: JSON.parse(row.weeks || '[]') };
const COLS = ['name', 'teacher', 'location', 'weekday', 'start_period', 'end_period', 'start_time', 'end_time', 'source_image'];

export function createCourseRepo(db) {
  const get = (id) => fromRow(db.prepare('SELECT * FROM courses WHERE id = ?').get(id));
  const insert = db.prepare(`INSERT INTO courses(${COLS.join(',')},weeks) VALUES (${COLS.map(() => '?').join(',')},?)`);
  const add = (c) => get(Number(insert.run(...COLS.map((k) => c[k] ?? null), JSON.stringify(c.weeks)).lastInsertRowid));

  return {
    get,
    list: () => db.prepare('SELECT * FROM courses ORDER BY weekday, COALESCE(start_period, 99), start_time, id').all().map(fromRow),
    create: add,
    update(id, input) {
      const existing = get(id);
      if (!existing) throw notFound('课程不存在');
      const next = cleanCourse({ ...existing, ...input });
      db.prepare(`UPDATE courses SET ${COLS.map((k) => `${k} = ?`).join(', ')}, weeks = ? WHERE id = ?`)
        .run(...COLS.map((k) => next[k] ?? null), JSON.stringify(next.weeks), id);
      return get(id);
    },
    remove(id) {
      if (!db.prepare('DELETE FROM courses WHERE id = ?').run(id).changes) throw notFound('课程不存在');
    },
    clear: () => db.exec('DELETE FROM courses'),
    /** mode 'replace' swaps the whole timetable atomically; 'append' keeps existing courses. */
    importMany(courses, mode) {
      return transaction(db, () => {
        if (mode === 'replace') db.exec('DELETE FROM courses');
        return courses.map(add);
      });
    },
  };
}

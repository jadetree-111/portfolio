// Turns raw model JSON into values the rest of the app can trust.
// The model's output is untrusted input: every field is coerced or dropped, never passed through.
import { isYmd, isHm, diffDays } from '../../shared/dates.js';
import { expandWeekRanges } from '../../shared/schedule.js';
import { cleanCourse } from '../courses.js';

const text = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const KINDS = new Set(['todo', 'event', 'deadline']);
const array = (v, max) => (Array.isArray(v) ? v.slice(0, max) : []);

export function sanitizeTasks(raw, today) {
  const warnings = [];
  const tasks = [];
  const seen = new Set(); // long screenshots are sliced with overlap, so the same item can appear twice
  for (const item of array(raw?.tasks, 30)) {
    const title = text(item?.title, 120);
    if (!title) continue;
    const fingerprint = [title, item.date, item.time].join('|');
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    let date = isYmd(item.date) ? item.date : null;
    if (date && (diffDays(date, today) < -366 || diffDays(date, today) > 1100)) {
      warnings.push(`「${title}」的日期 ${date} 离今天太远，已清空，请核对`);
      date = null;
    }
    const time = date && isHm(item.time) ? item.time : null;
    const end = time && isHm(item.end_time) && item.end_time > time ? item.end_time : null;
    tasks.push({
      title,
      details: String(item.details ?? '').trim().slice(0, 2000),
      kind: KINDS.has(item.kind) ? item.kind : 'todo',
      date,
      time,
      end_time: end,
      location: text(item.location, 120),
      priority: item.priority === 'high' ? 'high' : 'normal',
      tags: array(item.tags, 3).map((t) => text(t, 12)).filter(Boolean),
      remind_min: null,
      source_text: text(item.source_text, 200),
    });
  }
  return { tasks, notes: text(raw?.notes, 300), warnings };
}

// Some relays accept the response schema but do not enforce it, and the model then picks its own key
// names. The prompt spells the keys out; accepting the obvious aliases rescues the table if it drifts anyway.
const pick = (obj, ...keys) => keys.map((k) => obj?.[k]).find((v) => v !== undefined && v !== null);

function sanitizePeriods(raw, warnings) {
  const given = array(raw, 20);
  const rows = given
    .map((p) => ({ n: pick(p, 'n', 'period'), start: pick(p, 'start', 'start_time'), end: pick(p, 'end', 'end_time') }))
    .filter((p) => Number.isInteger(p.n) && isHm(p.start) && isHm(p.end) && p.start < p.end)
    .sort((a, b) => a.n - b.n);
  if (!rows.length) {
    if (given.length) warnings.push('图上的节次时间表没能识别，将使用默认节次时间');
    return [];
  }
  if (rows.some((p, i) => p.n !== i + 1)) {
    warnings.push('图上的节次时间表不连续，已忽略，将使用默认节次时间');
    return [];
  }
  return rows;
}

export function sanitizeTimetable(raw) {
  const warnings = array(raw?.warnings, 10).map((w) => text(w, 200)).filter(Boolean);
  const courses = [];
  for (const c of array(raw?.courses, 200)) {
    try {
      courses.push(cleanCourse({
        name: c?.name,
        teacher: c?.teacher,
        location: c?.location,
        weekday: c?.weekday,
        start_period: Number.isInteger(c?.start_period) ? c.start_period : null,
        end_period: Number.isInteger(c?.end_period) ? c.end_period : null,
        start_time: isHm(c?.start_time) ? c.start_time : null,
        end_time: isHm(c?.end_time) ? c.end_time : null,
        weeks: expandWeekRanges(c?.week_ranges),
      }));
    } catch (err) {
      warnings.push(`已跳过无法识别的课程「${text(c?.name, 30) || '无名称'}」：${err.message}`);
    }
  }
  let periods = sanitizePeriods(raw?.periods, warnings);
  // A table that stops before the last period any course uses would leave those periods without times.
  const lastUsed = Math.max(0, ...courses.map((c) => c.end_period ?? 0));
  if (periods.length && periods.length < lastUsed) {
    warnings.push('图上的节次时间表不完整，已忽略，将使用默认节次时间');
    periods = [];
  }
  // A time that only restates the period table is dropped, so editing the table later still moves the course.
  const at = (n) => periods.find((p) => p.n === n);
  for (const c of courses) {
    if (c.start_period && c.start_time && c.start_time === at(c.start_period)?.start) c.start_time = null;
    if (c.end_period && c.end_time && c.end_time === at(c.end_period)?.end) c.end_time = null;
  }
  return { courses, periods, warnings };
}

/** Pulls a JSON object out of model text, tolerating code fences and stray prose. */
export function parseModelJson(raw) {
  const body = String(raw ?? '').replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(body.slice(start, end + 1));
  } catch {
    return null;
  }
}

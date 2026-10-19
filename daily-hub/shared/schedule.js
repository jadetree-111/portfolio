// Timetable helpers shared by server (validation, ICS) and browser (rendering).
import { weekNumber, weekday, isHm, toMin } from './dates.js';

export const DEFAULT_PERIODS = [
  ['08:00', '08:45'], ['08:55', '09:40'], ['10:00', '10:45'], ['10:55', '11:40'],
  ['14:00', '14:45'], ['14:55', '15:40'], ['16:00', '16:45'], ['16:55', '17:40'],
  ['19:00', '19:45'], ['19:55', '20:40'], ['20:50', '21:35'], ['21:45', '22:30'],
].map(([start, end], i) => ({ n: i + 1, start, end }));

/** [{from,to,parity:'all'|'odd'|'even'}] -> sorted unique week numbers. */
export function expandWeekRanges(ranges, max = 60) {
  const set = new Set();
  for (const r of Array.isArray(ranges) ? ranges : []) {
    const from = Math.max(1, Math.trunc(Number(r?.from)));
    const to = Math.min(max, Math.trunc(Number(r?.to ?? r?.from)));
    if (!Number.isFinite(from) || !Number.isFinite(to)) continue;
    for (let w = from; w <= to; w++) {
      if (r.parity === 'odd' && w % 2 === 0) continue;
      if (r.parity === 'even' && w % 2 === 1) continue;
      set.add(w);
    }
  }
  return [...set].sort((a, b) => a - b);
}

/** "1-16" / "1-15单" / "2-16双" / "1-8,10-16" / "3,5,7周" -> week numbers; null when unparsable, [] when blank. */
export function parseWeeksText(text) {
  const src = String(text ?? '').replace(/[，、；;]/g, ',').replace(/[－—–~～至]/g, '-').replace(/周|\s/g, '');
  if (!src) return [];
  const ranges = [];
  for (const part of src.split(',')) {
    const m = /^(\d{1,2})(?:-(\d{1,2}))?(单|双)?$/.exec(part);
    if (!m) return null;
    const from = +m[1];
    const to = m[2] ? +m[2] : from;
    if (from < 1 || to < from || to > 60) return null;
    ranges.push({ from, to, parity: m[3] === '单' ? 'odd' : m[3] === '双' ? 'even' : 'all' });
  }
  return expandWeekRanges(ranges);
}

/** [1..16] -> "1-16周", [1,3,5] -> "1-5单周", [2,5,9] -> "2,5,9周". */
export function formatWeeks(weeks) {
  const w = [...new Set(weeks ?? [])].sort((a, b) => a - b);
  if (!w.length) return '';
  const parts = [];
  for (let i = 0; i < w.length;) {
    let step = 0;
    let j = i;
    for (const s of [1, 2]) {
      let k = i;
      while (k + 1 < w.length && w[k + 1] - w[k] === s) k++;
      if (k - i >= 2) { step = s; j = k; break; }
    }
    if (!step) { parts.push(String(w[i])); i++; continue; }
    const tag = step === 2 ? (w[i] % 2 ? '单' : '双') : '';
    parts.push(`${w[i]}-${w[j]}${tag}`);
    i = j + 1;
  }
  return `${parts.join(',')}周`;
}

/** Explicit clock times win; otherwise derive them from the period table. */
export function effectiveTimes(course, periods = DEFAULT_PERIODS) {
  const byN = new Map(periods.map((p) => [p.n, p]));
  const start = isHm(course.start_time) ? course.start_time : byN.get(course.start_period)?.start ?? null;
  const endP = course.end_period ?? course.start_period;
  const end = isHm(course.end_time) ? course.end_time : byN.get(endP)?.end ?? null;
  return { start, end };
}

/**
 * Which rows of the period grid a course covers: { from, to } (period numbers) or null.
 * Courses stored with clock times only are snapped to the periods they overlap.
 */
export function periodSpan(course, periods = DEFAULT_PERIODS) {
  if (course.start_period) {
    return { from: course.start_period, to: Math.max(course.start_period, course.end_period ?? course.start_period) };
  }
  const { start, end } = effectiveTimes(course, periods);
  if (!start) return null;
  const s = toMin(start);
  const e = end ? toMin(end) : s + 45;
  const first = periods.findIndex((p) => toMin(p.end) > s);
  if (first === -1) return null;
  let last = first;
  periods.forEach((p, i) => { if (toMin(p.start) < e) last = Math.max(last, i); });
  return { from: periods[first].n, to: periods[last].n };
}

/** Greedy lane assignment so overlapping items sit side by side. Mutates `items` ({from,to}); returns lane count. */
export function assignLanes(items) {
  const laneEnds = [];
  for (const item of [...items].sort((a, b) => a.from - b.from || a.to - b.to)) {
    let lane = laneEnds.findIndex((end) => end < item.from);
    if (lane === -1) { lane = laneEnds.length; laneEnds.push(item.to); } else laneEnds[lane] = item.to;
    item.lane = lane;
  }
  return Math.max(1, laneEnds.length);
}

export function courseOccursOn(course, ymd, semesterStart) {
  if (Number(course.weekday) !== weekday(ymd)) return false;
  const weeks = course.weeks ?? [];
  if (!weeks.length) return true;
  const wn = weekNumber(ymd, semesterStart);
  return wn === null ? true : weeks.includes(wn);
}

/** Courses on a date with effective times attached, ordered by start time. */
export function coursesOn(courses, ymd, settings = {}) {
  const periods = settings.periods?.length ? settings.periods : DEFAULT_PERIODS;
  return courses
    .filter((c) => courseOccursOn(c, ymd, settings.semesterStart))
    .map((c) => ({ ...c, ...effectiveTimes(c, periods) }))
    .sort((a, b) => (a.start ?? '99:99').localeCompare(b.start ?? '99:99'));
}

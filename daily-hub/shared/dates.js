// Date-only helpers. Every date is a "YYYY-MM-DD" string and all math runs in UTC,
// so time zones and DST can never shift a calendar day.
const DAY_MS = 86400000;

export const pad = (n) => String(n).padStart(2, '0');

export function toDate(ymd) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(typeof ymd === 'string' ? ymd : '');
  if (!m) return null;
  const [y, mo, d] = [+m[1], +m[2], +m[3]];
  const date = new Date(Date.UTC(y, mo - 1, d));
  const ok = date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
  return ok ? date : null;
}

export const isYmd = (s) => toDate(s) !== null;
export const fromDate = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
export const localYmd = (now = new Date()) => `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
export const addDays = (ymd, n) => fromDate(new Date(toDate(ymd).getTime() + n * DAY_MS));
export const diffDays = (a, b) => Math.round((toDate(a).getTime() - toDate(b).getTime()) / DAY_MS);
export const weekday = (ymd) => toDate(ymd).getUTCDay() || 7; // Mon=1 .. Sun=7
export const mondayOf = (ymd) => addDays(ymd, 1 - weekday(ymd));
export const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();

export const WEEKDAY_CN = ['一', '二', '三', '四', '五', '六', '日'];
export const weekdayLabel = (ymd) => `周${WEEKDAY_CN[weekday(ymd) - 1]}`;

/** Rows of 7 ymd strings covering the month. weekStartsOn: 1 = Monday, 7 = Sunday. */
export function monthGrid(year, month, weekStartsOn = 1) {
  const first = `${year}-${pad(month)}-01`;
  const lead = (weekday(first) - weekStartsOn + 7) % 7;
  const rows = Math.ceil((lead + daysInMonth(year, month)) / 7);
  const start = addDays(first, -lead);
  return Array.from({ length: rows }, (_, r) =>
    Array.from({ length: 7 }, (_, c) => addDays(start, r * 7 + c)));
}

export function shiftMonth(year, month, delta) {
  const i = year * 12 + (month - 1) + delta;
  return { year: Math.floor(i / 12), month: (i % 12) + 1 };
}

/** 1-based teaching week, counted from the Monday of the week containing semesterStart. */
export function weekNumber(ymd, semesterStart) {
  if (!isYmd(semesterStart) || !isYmd(ymd)) return null;
  return Math.floor(diffDays(ymd, mondayOf(semesterStart)) / 7) + 1;
}

export const isHm = (s) => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
export const toMin = (hm) => (isHm(hm) ? +hm.slice(0, 2) * 60 + +hm.slice(3) : null);
export const fromMin = (min) => `${pad(Math.floor(min / 60) % 24)}:${pad(min % 60)}`;

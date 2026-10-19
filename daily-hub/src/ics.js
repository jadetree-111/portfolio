// iCalendar (RFC 5545) feed. Subscribing to it in the phone's calendar app gives
// system-level reminders (VALARM) that work even when this page is closed.
import { addDays, mondayOf, toMin, fromMin } from '../shared/dates.js';
import { effectiveTimes, DEFAULT_PERIODS } from '../shared/schedule.js';

const MAX_EVENTS = 3000;
const esc = (s) => String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const d8 = (ymd) => ymd.replaceAll('-', '');
const local = (ymd, hm) => `${d8(ymd)}T${hm.replace(':', '')}00`;

/** Fold to 75 octets per line, never splitting a UTF-8 character. */
export function fold(line) {
  const out = [];
  let cur = '';
  let size = 0;
  for (const ch of line) {
    const n = Buffer.byteLength(ch);
    if (size + n > (out.length ? 74 : 75)) { out.push(cur); cur = ch; size = n; } else { cur += ch; size += n; }
  }
  out.push(cur);
  return out.join('\r\n ');
}

function vevent(stamp, e) {
  const lines = ['BEGIN:VEVENT', `UID:${e.uid}@daily-hub`, `DTSTAMP:${stamp}`];
  if (e.allDay) lines.push(`DTSTART;VALUE=DATE:${d8(e.date)}`, `DTEND;VALUE=DATE:${d8(addDays(e.date, 1))}`);
  else lines.push(`DTSTART:${local(e.date, e.start)}`, `DTEND:${local(e.date, e.end)}`);
  lines.push(`SUMMARY:${esc(e.summary)}`);
  if (e.location) lines.push(`LOCATION:${esc(e.location)}`);
  if (e.description) lines.push(`DESCRIPTION:${esc(e.description)}`);
  if (e.remindMin != null) {
    lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(e.summary)}`, `TRIGGER:-PT${e.remindMin}M`, 'END:VALARM');
  }
  lines.push('END:VEVENT');
  return lines;
}

function taskEvents(tasks) {
  return tasks.filter((t) => t.date && !t.done).map((t) => {
    const prefix = t.kind === 'deadline' ? '截止 · ' : '';
    const base = { uid: `task-${t.id}`, date: t.date, summary: prefix + t.title, location: t.location, description: t.details };
    if (!t.time) return { ...base, allDay: true };
    const end = t.end_time ?? fromMin(Math.min(toMin(t.time) + 60, 1439));
    return { ...base, start: t.time, end, remindMin: t.remind_min };
  });
}

function courseEvents(courses, settings, today) {
  const periods = settings.periods?.length ? settings.periods : DEFAULT_PERIODS;
  const weekOne = mondayOf(settings.semester_start || today);
  const events = [];
  for (const c of courses) {
    const { start, end } = effectiveTimes(c, periods);
    if (!start || !end) continue;
    // Without a semester start the UI shows courses every week, so the feed does too.
    const weeks = settings.semester_start && c.weeks.length ? c.weeks : Array.from({ length: 20 }, (_, i) => i + 1);
    for (const w of weeks) {
      const date = addDays(weekOne, (w - 1) * 7 + c.weekday - 1);
      events.push({ uid: `course-${c.id}-${date}`, date, start, end, summary: c.name, location: c.location, description: c.teacher ? `教师：${c.teacher}` : '' });
    }
  }
  return events;
}

export function buildIcs({ tasks, courses, settings, today, now = new Date() }) {
  const stamp = now.toISOString().replace(/[-:]|\.\d{3}/g, '');
  const events = [...taskEvents(tasks), ...courseEvents(courses, settings, today)].slice(0, MAX_EVENTS);
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//daily-hub//CN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'X-WR-CALNAME:Daily Hub', 'X-WR-TIMEZONE:Asia/Shanghai', 'REFRESH-INTERVAL;VALUE=DURATION:PT1H', 'X-PUBLISHED-TTL:PT1H',
    ...events.flatMap((e) => vevent(stamp, e)), 'END:VCALENDAR',
  ];
  return `${lines.map(fold).join('\r\n')}\r\n`;
}

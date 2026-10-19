import test from 'node:test';
import assert from 'node:assert/strict';
import {
  toDate, isYmd, addDays, diffDays, weekday, mondayOf, monthGrid, shiftMonth, weekNumber, weekdayLabel, toMin, fromMin,
} from '../shared/dates.js';
import {
  expandWeekRanges, formatWeeks, effectiveTimes, coursesOn, parseWeeksText, periodSpan, assignLanes, DEFAULT_PERIODS,
} from '../shared/schedule.js';

test('periodSpan uses stored periods, or snaps clock times onto the period table', () => {
  assert.deepEqual(periodSpan({ start_period: 3, end_period: 4 }), { from: 3, to: 4 });
  assert.deepEqual(periodSpan({ start_period: 3 }), { from: 3, to: 3 });
  assert.deepEqual(periodSpan({ start_time: '08:00', end_time: '09:40' }), { from: 1, to: 2 });
  assert.deepEqual(periodSpan({ start_time: '10:10', end_time: '11:40' }), { from: 3, to: 4 });
  assert.deepEqual(periodSpan({ start_time: '13:30', end_time: '15:05' }), { from: 5, to: 6 });
  assert.equal(periodSpan({ start_time: '23:30', end_time: '23:50' }), null);
  assert.equal(periodSpan({ name: 'no time info' }), null);
});

test('overlapping courses are placed in separate lanes', () => {
  const apart = [{ from: 1, to: 2 }, { from: 3, to: 4 }];
  assert.equal(assignLanes(apart), 1);
  assert.deepEqual(apart.map((i) => i.lane), [0, 0]);
  const clash = [{ from: 1, to: 3 }, { from: 2, to: 4 }, { from: 4, to: 5 }];
  assert.equal(assignLanes(clash), 2);
  assert.deepEqual(clash.map((i) => i.lane), [0, 1, 0]);
  assert.equal(assignLanes([]), 1);
});

test('week text parses the notations found on Chinese timetables', () => {
  assert.deepEqual(parseWeeksText('1-4'), [1, 2, 3, 4]);
  assert.deepEqual(parseWeeksText('1-8周'), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(parseWeeksText('1-7单'), [1, 3, 5, 7]);
  assert.deepEqual(parseWeeksText('2-8双周'), [2, 4, 6, 8]);
  assert.deepEqual(parseWeeksText('1-2，5-6'), [1, 2, 5, 6]);
  assert.deepEqual(parseWeeksText('3、5、7'), [3, 5, 7]);
  assert.deepEqual(parseWeeksText(''), []);
  assert.equal(parseWeeksText('abc'), null);
  assert.equal(parseWeeksText('8-3'), null);
  assert.equal(parseWeeksText('0-3'), null);
  assert.equal(parseWeeksText('1-99'), null);
});

test('toDate rejects impossible dates', () => {
  assert.equal(isYmd('2026-02-29'), false);
  assert.equal(isYmd('2028-02-29'), true);
  assert.equal(isYmd('2026-13-01'), false);
  assert.equal(isYmd('2026-1-1'), false);
  assert.equal(toDate(null), null);
});

test('day arithmetic is calendar-exact across month and year ends', () => {
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(diffDays('2026-10-17', '2026-10-10'), 7);
  assert.equal(weekday('2026-10-17'), 6); // Saturday
  assert.equal(weekday('2026-10-18'), 7); // Sunday
  assert.equal(mondayOf('2026-10-18'), '2026-10-12');
  assert.equal(weekdayLabel('2026-10-12'), '周一');
});

test('monthGrid fills whole weeks and starts on the requested weekday', () => {
  const grid = monthGrid(2026, 10, 1);
  assert.equal(grid.length, 5);
  assert.equal(grid[0][0], '2026-09-28');
  assert.equal(grid.at(-1).at(-1), '2026-11-01');
  const sun = monthGrid(2026, 10, 7);
  assert.equal(sun[0][0], '2026-09-27');
  assert.ok(grid.flat().every((d) => isYmd(d)));
  assert.deepEqual(shiftMonth(2026, 1, -1), { year: 2025, month: 12 });
  assert.deepEqual(shiftMonth(2026, 12, 1), { year: 2027, month: 1 });
});

test('weekNumber counts teaching weeks from the semester start week', () => {
  assert.equal(weekNumber('2026-09-07', '2026-09-07'), 1);
  assert.equal(weekNumber('2026-09-13', '2026-09-07'), 1);
  assert.equal(weekNumber('2026-09-14', '2026-09-07'), 2);
  assert.equal(weekNumber('2026-09-06', '2026-09-07'), 0);
  assert.equal(weekNumber('2026-09-14', null), null);
});

test('clock helpers', () => {
  assert.equal(toMin('08:30'), 510);
  assert.equal(toMin('8:30'), null);
  assert.equal(fromMin(510), '08:30');
});

test('week ranges expand with parity and format back compactly', () => {
  assert.deepEqual(expandWeekRanges([{ from: 1, to: 4, parity: 'all' }]), [1, 2, 3, 4]);
  assert.deepEqual(expandWeekRanges([{ from: 1, to: 8, parity: 'odd' }]), [1, 3, 5, 7]);
  assert.deepEqual(expandWeekRanges([{ from: 2, to: 8, parity: 'even' }, { from: 3, to: 3, parity: 'all' }]), [2, 3, 4, 6, 8]);
  assert.equal(formatWeeks([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]), '1-16周');
  assert.equal(formatWeeks([1, 3, 5, 7]), '1-7单周');
  assert.equal(formatWeeks([2, 4, 6]), '2-6双周');
  assert.equal(formatWeeks([2, 5, 9]), '2,5,9周');
  assert.equal(formatWeeks([1, 2, 3, 5, 6, 7]), '1-3,5-7周');
  assert.equal(formatWeeks([]), '');
});

test('courses resolve times from periods and filter by teaching week', () => {
  const course = { name: '高数', weekday: 1, start_period: 1, end_period: 2, weeks: [1, 2, 3] };
  assert.deepEqual(effectiveTimes(course), { start: '08:00', end: DEFAULT_PERIODS[1].end });
  const custom = { ...course, start_time: '13:30', end_time: '15:05' };
  assert.deepEqual(effectiveTimes(custom), { start: '13:30', end: '15:05' });
  const settings = { semesterStart: '2026-09-07' };
  assert.equal(coursesOn([course], '2026-09-07', settings).length, 1); // Monday, week 1
  assert.equal(coursesOn([course], '2026-09-28', settings).length, 0); // week 4
  assert.equal(coursesOn([course], '2026-09-08', settings).length, 0); // Tuesday
});

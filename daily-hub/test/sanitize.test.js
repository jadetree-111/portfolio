import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeTimetable, sanitizeTasks, parseModelJson } from '../src/ai/sanitize.js';

const course = (over = {}) => ({
  name: '高数', teacher: '', location: '', weekday: 1, start_period: 1, end_period: 2,
  start_time: null, end_time: null, week_ranges: [], ...over,
});
const periods = (n) => Array.from({ length: n }, (_, i) => ({ n: i + 1, start: `0${i + 1}:00`, end: `0${i + 1}:45` }));

test('an incomplete or gappy period table is ignored instead of overriding the defaults', () => {
  const full = sanitizeTimetable({ courses: [course({ end_period: 4 })], periods: periods(4), warnings: [] });
  assert.equal(full.periods.length, 4);

  const partial = sanitizeTimetable({ courses: [course({ end_period: 4 })], periods: periods(1), warnings: [] });
  assert.deepEqual(partial.periods, []);
  assert.ok(partial.warnings.some((w) => w.includes('不完整')));

  const gap = sanitizeTimetable({
    courses: [course()], warnings: [],
    periods: [{ n: 1, start: '08:00', end: '08:45' }, { n: 3, start: '10:00', end: '10:45' }],
  });
  assert.deepEqual(gap.periods, []);
  assert.ok(gap.warnings.some((w) => w.includes('不连续')));
});

test('period rows with alias key names are rescued; an unusable table is reported, not silently dropped', () => {
  const alias = sanitizeTimetable({
    courses: [course()], warnings: [],
    periods: [{ period: 1, start_time: '08:00', end_time: '08:45' }, { period: 2, start_time: '08:55', end_time: '09:40' }],
  });
  assert.deepEqual(alias.periods, [{ n: 1, start: '08:00', end: '08:45' }, { n: 2, start: '08:55', end: '09:40' }]);
  assert.deepEqual(alias.warnings, []);

  const junk = sanitizeTimetable({ courses: [course()], warnings: [], periods: [{ foo: 1 }, 'x', null] });
  assert.deepEqual(junk.periods, []);
  assert.ok(junk.warnings.some((w) => w.includes('没能识别')));

  assert.deepEqual(sanitizeTimetable({ courses: [course()], warnings: [], periods: [] }).warnings, [], 'no table in the image is not a problem');
});

test('course times that merely restate the period table are dropped, so editing the table still moves the course', () => {
  const table = [{ n: 1, start: '08:00', end: '08:45' }, { n: 2, start: '08:55', end: '09:40' }];
  const out = sanitizeTimetable({
    courses: [course({ start_time: '08:00', end_time: '09:40' }), course({ name: '调课', start_time: '08:10', end_time: '09:40' })],
    periods: table, warnings: [],
  });
  assert.equal(out.courses[0].start_time, null);
  assert.equal(out.courses[0].end_time, null);
  assert.equal(out.courses[1].start_time, '08:10', 'a genuinely different time is kept');
  assert.equal(out.courses[1].end_time, null);

  const noTable = sanitizeTimetable({ courses: [course({ start_time: '08:00', end_time: '09:40' })], periods: [], warnings: [] });
  assert.equal(noTable.courses[0].start_time, '08:00', 'without an accepted table the explicit times are all we have');
});

test('courses: unusable rows are skipped with a reason, usable ones keep expanded weeks', () => {
  const out = sanitizeTimetable({
    courses: [
      course({ week_ranges: [{ from: 1, to: 5, parity: 'odd' }] }),
      course({ name: '' }),
      course({ name: '无时间', start_period: null, end_period: null }),
    ],
    periods: [], warnings: ['模糊'],
  });
  assert.equal(out.courses.length, 1);
  assert.deepEqual(out.courses[0].weeks, [1, 3, 5]);
  assert.equal(out.warnings.length, 3);
});

test('tasks: invalid values are coerced or dropped, never passed through', () => {
  const out = sanitizeTasks({
    tasks: [
      { title: ' 开会 ', kind: 'weird', date: '2026-10-20', time: '25:00', end_time: '10:00', priority: 'urgent', tags: ['a', '', 5, 'b', 'c'], location: 7 },
      { title: '无日期但有时间', date: null, time: '09:00' },
      { title: '结束早于开始', date: '2026-10-20', time: '10:00', end_time: '09:00' },
    ],
  }, '2026-10-17');
  assert.equal(out.tasks.length, 3);
  assert.equal(out.tasks[0].title, '开会');
  assert.equal(out.tasks[0].kind, 'todo');
  assert.equal(out.tasks[0].time, null);
  assert.equal(out.tasks[0].end_time, null);
  assert.equal(out.tasks[0].priority, 'normal');
  assert.deepEqual(out.tasks[0].tags, ['a', '5']); // only the first three entries are considered
  assert.equal(out.tasks[0].location, '7');
  assert.equal(out.tasks[1].time, null);
  assert.equal(out.tasks[2].end_time, null);
  assert.deepEqual(sanitizeTasks(null, '2026-10-17'), { tasks: [], notes: '', warnings: [] });
});

test('parseModelJson tolerates fences and prose, and rejects garbage', () => {
  assert.deepEqual(parseModelJson('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(parseModelJson('Here you go: {"a":1} hope that helps'), { a: 1 });
  assert.equal(parseModelJson('no json here'), null);
  assert.equal(parseModelJson('{"a":'), null);
  assert.equal(parseModelJson(''), null);
  assert.equal(parseModelJson(undefined), null);
});

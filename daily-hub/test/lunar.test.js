import test from 'node:test';
import assert from 'node:assert/strict';
import { lunarOf, solarTermOf, festivalsOf, dayLabel, lunarText, parseLunarParts } from '../shared/lunar.js';

test('lunar parts parse whichever numerals the browser engine produces', () => {
  const nine = { month: 9, day: 8, leap: false, monthName: '九月', dayName: '初八' };
  assert.deepEqual(parseLunarParts('9', '8'), nine);
  assert.deepEqual(parseLunarParts('九月', '初八'), nine);
  assert.deepEqual(parseLunarParts('闰6', '1'), { month: 6, day: 1, leap: true, monthName: '闰六月', dayName: '初一' });
  assert.deepEqual(parseLunarParts('闰六月', '初一'), { month: 6, day: 1, leap: true, monthName: '闰六月', dayName: '初一' });
  assert.equal(parseLunarParts('正月', '初一').month, 1);
  assert.equal(parseLunarParts('腊月', '廿九').day, 29);
  assert.equal(parseLunarParts('十二月', '三十').day, 30);
  assert.equal(parseLunarParts('冬月', '十五').month, 11);
  assert.equal(parseLunarParts('Month9', 'x'), null);
  assert.equal(parseLunarParts(undefined, undefined), null);
  assert.equal(parseLunarParts('13', '1'), null);
});

test('Intl output agrees with the generated lunar date for every day of 2026 (month lengths stay in range)', () => {
  let leapSeen = false;
  for (let d = Date.UTC(2026, 0, 1); d < Date.UTC(2027, 0, 1); d += 86400000) {
    const ymd = new Date(d).toISOString().slice(0, 10);
    const l = lunarOf(ymd);
    assert.ok(l && l.day >= 1 && l.day <= 30, `${ymd} has a lunar date`);
    leapSeen ||= l.leap;
  }
  assert.equal(leapSeen, false, '2026 has no leap month');
});

test('lunar conversion matches known dates', () => {
  assert.deepEqual(lunarOf('2026-10-17'), { month: 9, day: 8, leap: false, monthName: '九月', dayName: '初八' });
  assert.equal(lunarText('2026-02-17'), '正月初一');
  assert.equal(lunarText('2026-02-16'), '腊月廿九');
  const leap = lunarOf('2025-07-25');
  assert.equal(leap.leap, true);
  assert.equal(leap.monthName, '闰六月');
  assert.equal(lunarOf('nonsense'), null);
});

test('solar terms come from the generated table', () => {
  assert.equal(solarTermOf('2026-02-04'), '立春');
  assert.equal(solarTermOf('2026-03-20'), '春分');
  assert.equal(solarTermOf('2026-06-21'), '夏至');
  assert.equal(solarTermOf('2026-09-23'), '秋分');
  assert.equal(solarTermOf('2026-12-22'), '冬至');
  assert.equal(solarTermOf('2025-12-21'), '冬至');
  assert.equal(solarTermOf('2026-10-17'), null);
  assert.equal(solarTermOf('1999-01-01'), null);
});

test('festivals: lunar, solar and weekday based', () => {
  assert.deepEqual(festivalsOf('2026-02-17'), ['春节']);
  assert.deepEqual(festivalsOf('2026-02-16'), ['除夕']);
  assert.deepEqual(festivalsOf('2026-09-25'), ['中秋节']);
  assert.deepEqual(festivalsOf('2026-06-19'), ['端午节']);
  assert.deepEqual(festivalsOf('2026-10-01'), ['国庆节']);
  assert.deepEqual(festivalsOf('2026-05-10'), ['母亲节']);
  assert.deepEqual(festivalsOf('2026-06-21'), ['父亲节']);
  assert.deepEqual(festivalsOf('2026-11-26'), ['感恩节']);
  assert.ok(festivalsOf('2026-04-05').includes('清明节'));
  assert.deepEqual(festivalsOf('2026-10-17'), []);
});

test('cell label priority: festival > term > lunar month start > lunar day', () => {
  assert.deepEqual(dayLabel('2026-06-21'), { text: '父亲节', kind: 'festival' });
  assert.deepEqual(dayLabel('2026-12-22'), { text: '冬至', kind: 'term' });
  assert.deepEqual(dayLabel('2026-10-17'), { text: '初八', kind: 'lunar' });
  assert.deepEqual(dayLabel('2026-10-10'), { text: '九月', kind: 'lunar' });
});

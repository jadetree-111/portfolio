// Chinese lunar calendar labels, solar terms and festivals for calendar cells.
// Lunar dates come from the engine's built-in Chinese calendar (Intl); solar terms from a table.
import { toDate, addDays, weekday, pad } from './dates.js';
import { TERM_DAYS } from './solar-terms-data.js';

const fmt = new Intl.DateTimeFormat('zh-CN-u-ca-chinese', { timeZone: 'UTC', month: 'numeric', day: 'numeric' });
const MONTH_CN = ['正', '二', '三', '四', '五', '六', '七', '八', '九', '十', '冬', '腊'];
const NUM = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];

const TERMS = ['小寒', '大寒', '立春', '雨水', '惊蛰', '春分', '清明', '谷雨', '立夏', '小满', '芒种', '夏至',
  '小暑', '大暑', '立秋', '处暑', '白露', '秋分', '寒露', '霜降', '立冬', '小雪', '大雪', '冬至'];

const SOLAR = {
  '01-01': '元旦', '02-14': '情人节', '03-08': '妇女节', '03-12': '植树节', '04-01': '愚人节',
  '05-01': '劳动节', '05-04': '青年节', '06-01': '儿童节', '07-01': '建党节', '08-01': '建军节',
  '09-10': '教师节', '10-01': '国庆节', '12-24': '平安夜', '12-25': '圣诞节',
};

const LUNAR = {
  '1-1': '春节', '1-15': '元宵节', '2-2': '龙抬头', '5-5': '端午节', '7-7': '七夕',
  '7-15': '中元节', '8-15': '中秋节', '9-9': '重阳节', '12-8': '腊八节', '12-23': '小年',
};

function dayName(d) {
  if (d < 10) return `初${NUM[d]}`;
  if (d === 10) return '初十';
  if (d < 20) return `十${NUM[d - 10]}`;
  if (d === 20) return '二十';
  if (d < 30) return `廿${NUM[d - 20]}`;
  return '三十';
}

const MONTH_BY_NAME = { ...Object.fromEntries(MONTH_CN.map((n, i) => [n, i + 1])), 一: 1, 十一: 11, 十二: 12 };
const DAY_BY_NAME = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [dayName(i + 1), i + 1]));

/**
 * Month and day from Intl's parts. Engines differ in numerals ("9", "闰6", "九月", "初八"),
 * so both digits and Chinese names are accepted. Returns null for anything else.
 */
export function parseLunarParts(monthText, dayText) {
  const monthStr = String(monthText ?? '');
  const dayStr = String(dayText ?? '');
  const month = parseInt(monthStr.replace(/\D/g, ''), 10) || MONTH_BY_NAME[monthStr.replace(/[闰月\s]/g, '')];
  const day = parseInt(dayStr.replace(/\D/g, ''), 10) || DAY_BY_NAME[dayStr.replace(/\s/g, '')];
  if (!(month >= 1 && month <= 12) || !(day >= 1 && day <= 30)) return null;
  const leap = /闰|bis/i.test(monthStr);
  return { month, day, leap, monthName: `${leap ? '闰' : ''}${MONTH_CN[month - 1]}月`, dayName: dayName(day) };
}

/** { month, day, leap, monthName, dayName } or null when the engine lacks the Chinese calendar. */
export function lunarOf(ymd) {
  const date = toDate(ymd);
  if (!date) return null;
  date.setUTCHours(12);
  const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
  return parseLunarParts(parts.month, parts.day);
}

export function solarTermOf(ymd) {
  const row = TERM_DAYS[+ymd.slice(0, 4)];
  if (!row) return null;
  const month = +ymd.slice(5, 7);
  const day = +ymd.slice(8, 10);
  for (let i = (month - 1) * 2; i < (month - 1) * 2 + 2; i++) {
    if (+row.slice(i * 2, i * 2 + 2) === day) return TERMS[i];
  }
  return null;
}

function nthWeekdayFestival(ymd) {
  const month = +ymd.slice(5, 7);
  const nth = Math.ceil(+ymd.slice(8, 10) / 7);
  const wd = weekday(ymd);
  if (month === 5 && nth === 2 && wd === 7) return '母亲节';
  if (month === 6 && nth === 3 && wd === 7) return '父亲节';
  if (month === 11 && nth === 4 && wd === 4) return '感恩节';
  return null;
}

/** All festival names for a date (solar, lunar and weekday-based). */
export function festivalsOf(ymd) {
  const names = [];
  if (SOLAR[ymd.slice(5)]) names.push(SOLAR[ymd.slice(5)]);
  const nth = nthWeekdayFestival(ymd);
  if (nth) names.push(nth);
  if (solarTermOf(ymd) === '清明') names.push('清明节');
  const lunar = lunarOf(ymd);
  if (lunar && !lunar.leap) {
    const hit = LUNAR[`${lunar.month}-${lunar.day}`];
    if (hit) names.push(hit);
    const next = lunarOf(addDays(ymd, 1));
    if (lunar.month === 12 && next && next.month === 1 && !next.leap) names.push('除夕');
  }
  return names;
}

/** Short cell label: festival > solar term > lunar month (on day 1) > lunar day. */
export function dayLabel(ymd) {
  const festival = festivalsOf(ymd).filter((n) => n !== '清明节')[0] ?? festivalsOf(ymd)[0];
  if (festival) return { text: festival, kind: 'festival' };
  const term = solarTermOf(ymd);
  if (term) return { text: term, kind: 'term' };
  const lunar = lunarOf(ymd);
  if (!lunar) return { text: '', kind: 'lunar' };
  return { text: lunar.day === 1 ? lunar.monthName : lunar.dayName, kind: 'lunar' };
}

export const lunarText = (ymd) => {
  const l = lunarOf(ymd);
  return l ? `${l.monthName}${l.dayName}` : '';
};
export { pad };

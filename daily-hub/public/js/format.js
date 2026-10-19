import { diffDays, weekdayLabel, localYmd } from '/shared/dates.js';

/** "今天" / "明天" / "10月20日 周二". */
export function friendlyDate(ymd, today = localYmd()) {
  const d = diffDays(ymd, today);
  if (d === 0) return '今天';
  if (d === 1) return '明天';
  if (d === 2) return '后天';
  if (d === -1) return '昨天';
  return `${+ymd.slice(5, 7)}月${+ymd.slice(8, 10)}日 ${weekdayLabel(ymd)}`;
}

export const timeRange = (start, end) => (start && end ? `${start}–${end}` : start || '');

export const KIND_LABEL = { todo: '待办', event: '日程', deadline: '截止' };
export const PRIORITY_LABEL = { low: '低', normal: '普通', high: '重要' };
export const REMIND_OPTIONS = [
  [null, '不提醒'], [0, '准时'], [5, '提前 5 分钟'], [15, '提前 15 分钟'],
  [30, '提前 30 分钟'], [60, '提前 1 小时'], [1440, '提前 1 天'],
];

export function groupBy(items, keyOf) {
  const map = new Map();
  for (const item of items) {
    const key = keyOf(item);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  }
  return map;
}

export const hueOf = (text) => [...String(text)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7);

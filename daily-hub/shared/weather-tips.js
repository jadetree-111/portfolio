// Life-index style tips derived from the forecast. Pure function: easy to test and used by the browser.
import { aqiLevel, uvLevel, isWetCode, windScale } from './weather-codes.js';

const CLOTHING = [
  [30, '炎热', '短袖短裤、透气面料，注意防暑补水'],
  [25, '偏热', '短袖或薄衫就够了'],
  [20, '舒适', '薄长袖或衬衫，早晚可备一件薄外套'],
  [15, '微凉', '卫衣、薄外套比较合适'],
  [10, '较冷', '风衣、夹克加一件针织衫'],
  [5, '寒冷', '厚外套或大衣，建议围巾'],
  [-99, '严寒', '羽绒服或棉服，注意手脚保暖'],
];

const tip = (id, icon, title, text, level = 'info') => ({ id, icon, title, text, level });
const hourlyWindow = (hourly, n) => (hourly ?? []).slice(0, n);

/** @returns {Array<{id,icon,title,text,level:'good'|'info'|'warn'}>} most important first */
export function buildTips({ current, hourly, daily, air }) {
  const today = daily?.[0];
  const tomorrow = daily?.[1];
  if (!current || !today) return [];
  const tips = [];

  const feels = (today.feelsMax + today.feelsMin) / 2;
  const [, label, advice] = CLOTHING.find(([min]) => feels >= min);
  tips.push(tip('clothing', '👕', `穿衣 · ${label}`, advice));

  const next12 = hourlyWindow(hourly, 12);
  const maxPop = Math.max(0, ...next12.map((h) => h.pop ?? 0));
  const thunder = next12.some((h) => [95, 96, 99].includes(h.code));
  if (thunder) tips.push(tip('rain', '⛈️', '雷雨提醒', '未来 12 小时可能有雷暴，尽量避免在空旷处停留', 'warn'));
  else if (maxPop >= 50 || (isWetCode(current.code) && current.precip > 0)) {
    tips.push(tip('rain', '☂️', '记得带伞', `未来 12 小时最高降水概率 ${maxPop}%`, 'warn'));
  } else if (maxPop >= 30) tips.push(tip('rain', '🌂', '备把折叠伞', `未来 12 小时降水概率最高 ${maxPop}%`));

  if (today.uvMax >= 3) {
    const { label: uv } = uvLevel(today.uvMax);
    tips.push(tip('uv', '🧴', `紫外线 · ${uv}`, today.uvMax >= 6 ? '中午前后避免暴晒，涂防晒、戴帽子' : '长时间外出建议涂防晒', today.uvMax >= 6 ? 'warn' : 'info'));
  }

  if (air) {
    const level = aqiLevel(Math.max(air.aqi, Math.min(air.maxNext, air.aqi + 40)));
    if (air.aqi > 150) tips.push(tip('air', '😷', `空气 · ${aqiLevel(air.aqi).label}`, '外出请戴口罩，减少户外活动', 'warn'));
    else if (air.aqi > 100) tips.push(tip('air', '😷', `空气 · ${aqiLevel(air.aqi).label}`, '敏感人群减少长时间户外运动', 'warn'));
    else if (level.tone === 'good') tips.push(tip('air', '🍃', '空气清新', `AQI ${air.aqi}，适合开窗通风`, 'good'));
  }

  const range = today.max - today.min;
  if (range >= 10) tips.push(tip('range', '🌡️', '昼夜温差大', `今天相差 ${Math.round(range)}°C，出门带件外套`));
  if (tomorrow && today.max - tomorrow.max >= 6) {
    tips.push(tip('cooling', '📉', '明天明显降温', `最高温将下降 ${Math.round(today.max - tomorrow.max)}°C，提前备好衣物`, 'warn'));
  }
  if (windScale(today.gustMax ?? 0) >= 7) tips.push(tip('wind', '💨', '阵风较大', `阵风可达 ${windScale(today.gustMax)} 级，注意高空坠物`, 'warn'));

  const calm = (today.windMax ?? 0) < 8;
  if (feels >= 8 && feels <= 28 && maxPop < 30 && (!air || air.aqi <= 100) && calm) {
    tips.push(tip('sport', '🏃', '适合户外运动', '温度、空气和风力都合适', 'good'));
  }
  const dry3 = (daily ?? []).slice(0, 3).every((d) => (d.pop ?? 0) < 30);
  if (dry3) tips.push(tip('car', '🚗', '适合洗车', '未来三天降水概率都很低', 'good'));
  if (maxPop < 20 && current.humidity < 75 && today.uvMax >= 2 && !isWetCode(current.code)) {
    tips.push(tip('laundry', '👚', '适合晾晒', '天气干爽有阳光，衣物干得快', 'good'));
  }

  const order = { warn: 0, info: 1, good: 2 };
  return tips.sort((a, b) => order[a.level] - order[b.level]);
}

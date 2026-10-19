import { h, mount, debounce } from '../dom.js';
import { api } from '../api.js';
import { saveSettings } from '../store.js';
import { openSheet } from '../sheet.js';
import { toastError } from '../toast.js';
import { describeWeather, windScale, windDirection, aqiLevel, uvLevel } from '/shared/weather-codes.js';
import { weekdayLabel, diffDays } from '/shared/dates.js';

export const title = '天气';

let showAll = false;
const deg = (n) => `${Math.round(n)}°`;
const stat = (label, value, sub) => h('div', { class: 'stat' }, h('span', { class: 'small muted' }, label), h('b', {}, value), sub && h('span', { class: 'small muted' }, sub));
const hhmm = (iso) => iso.slice(11, 16);

function dayLabel(date, today) {
  const n = diffDays(date, today);
  return n === 0 ? '今天' : n === 1 ? '明天' : weekdayLabel(date);
}

function dayRow(d, lo, hi, today) {
  const span = Math.max(1, hi - lo);
  const bar = h('i', { style: { left: `${((d.min - lo) / span) * 100}%`, width: `${Math.max(8, ((d.max - d.min) / span) * 100)}%` } });
  const wx = describeWeather(d.code);
  return h('div', { class: 'w-day', role: 'listitem', 'aria-label': `${dayLabel(d.date, today)} ${wx.text} ${deg(d.min)}到${deg(d.max)} 降水概率${d.pop ?? 0}%` },
    h('span', {}, dayLabel(d.date, today), h('div', { class: 'small muted' }, `${+d.date.slice(5, 7)}/${+d.date.slice(8)}`)),
    h('span', { 'aria-hidden': 'true' }, wx.icon),
    h('div', { class: 'row', 'aria-hidden': 'true' }, h('span', { class: 'small muted' }, deg(d.min)), h('div', { class: 'w-bar grow' }, bar), h('span', {}, deg(d.max))),
    h('span', { class: 'small muted' }, (d.pop ?? 0) >= 20 ? `💧${d.pop}%` : ''));
}

function view(w) {
  const today = w.daily[0].date; // the city's own "today", which differs from the browser's for other time zones
  const now = describeWeather(w.current.code, w.current.isDay);
  const day = w.daily[0];
  const days = showAll ? w.daily : w.daily.slice(0, 7);
  const lo = Math.min(...days.map((d) => d.min));
  const hi = Math.max(...days.map((d) => d.max));
  const hours = w.hourly.filter((x) => x.time >= w.current.time.slice(0, 13)).slice(0, 24);
  const aqi = w.air && aqiLevel(w.air.aqi);
  const uv = uvLevel(day.uvMax);
  return [
    w.stale && h('p', { class: 'card small' }, '⚠ 网络不通，显示的是上次获取的数据'),
    h('div', { class: 'card stack' },
      h('div', { class: 'w-now' },
        h('span', { class: 'w-icon', 'aria-hidden': 'true' }, now.icon),
        h('div', { class: 'grow' }, h('div', { class: 'hero-line' }, h('span', { class: 'w-temp' }, deg(w.current.temp)), h('span', {}, now.text)),
          h('div', { class: 'small muted' }, `${deg(day.min)} ~ ${deg(day.max)} · 体感 ${deg(w.current.feels)}`))),
      h('div', { class: 'stats' },
        stat('湿度', `${w.current.humidity}%`),
        stat('风', `${windDirection(w.current.windDir)}风 ${windScale(w.current.wind)} 级`, `${w.current.wind.toFixed(1)} m/s`),
        stat('气压', `${Math.round(w.current.pressure)} hPa`),
        stat('紫外线', uv.label, day.uvMax == null ? '' : `指数 ${day.uvMax.toFixed(1)}`),
        w.air && stat('空气质量', h('span', { class: `badge ${aqi.tone}` }, `${w.air.aqi} ${aqi.label}`), `PM2.5 ${Math.round(w.air.pm25)}`),
        stat('日出日落', `${hhmm(day.sunrise)} / ${hhmm(day.sunset)}`))),
    w.tips.length > 0 && h('div', { class: 'card stack' }, h('h2', {}, '生活小贴士'),
      h('div', { class: 'tips' }, w.tips.map((t) => h('div', { class: `tip ${t.level}` }, h('span', { 'aria-hidden': 'true' }, t.icon), h('div', {}, h('b', {}, t.title), h('div', { class: 'small' }, t.text)))))),
    h('div', { class: 'card stack' }, h('h2', {}, '未来 24 小时'),
      h('div', { class: 'w-hourly' }, hours.map((x) => h('div', { class: 'w-hour' },
        h('span', { class: 'small muted' }, `${x.time.slice(11, 13)}时`), h('span', { 'aria-hidden': 'true' }, describeWeather(x.code, x.isDay).icon),
        h('b', {}, deg(x.temp)), h('span', { class: 'small muted' }, (x.pop ?? 0) >= 20 ? `${x.pop}%` : ' '))))),
    h('div', { class: 'card stack' }, h('div', { class: 'row between' }, h('h2', {}, showAll ? '未来 16 天' : '未来 7 天'),
      h('button', { class: 'btn small', type: 'button', onclick: (e) => { showAll = !showAll; e.target.dispatchEvent(new Event('dh:redraw', { bubbles: true })); } }, showAll ? '收起' : '展开 16 天')),
    h('div', { class: 'w-days', role: 'list' }, days.map((d) => dayRow(d, lo, hi, today)))),
    h('p', { class: 'small muted center' }, '数据来自 Open-Meteo，空气质量为美国 AQI 标准'),
  ];
}

function pickCity(onDone) {
  return openSheet('选择城市', (close) => {
    const input = h('input', { type: 'search', placeholder: '输入城市名，如 杭州、Tokyo', autocomplete: 'off', 'aria-label': '搜索城市' });
    const list = h('div', { class: 'stack', role: 'list' });
    const search = debounce(async () => {
      if (!input.value.trim()) return mount(list);
      try {
        const { results } = await api.get(`/api/cities?q=${encodeURIComponent(input.value.trim())}`);
        mount(list, results.length ? results.map((c) => h('button', {
          class: 'btn', type: 'button', role: 'listitem',
          onclick: async () => { try { await saveSettings({ city: { name: c.name, lat: c.lat, lon: c.lon } }); close(); onDone(); } catch (e) { toastError(e); } },
        }, `${c.name}`, h('span', { class: 'small muted' }, ` ${[c.region, c.country].filter(Boolean).join(' · ')}`))) : h('p', { class: 'empty' }, '没有找到这个城市'));
      } catch (err) { toastError(err); }
    }, 350);
    input.addEventListener('input', search);
    queueMicrotask(() => input.focus());
    return [input, list];
  });
}

export async function render(container, ctx) {
  const body = h('div', { class: 'stack' });
  mount(container, body);
  const draw = async () => {
    mount(body, h('p', { class: 'empty muted', role: 'status' }, '加载中…'));
    const w = await api.get('/api/weather', { signal: ctx.signal });
    mount(body, h('div', { class: 'row between' }, h('h2', {}, `📍 ${w.city}`),
      h('button', { class: 'btn small', type: 'button', onclick: () => pickCity(() => draw().catch(toastError)) }, '换城市')), ...view(w));
  };
  body.addEventListener('dh:redraw', () => draw().catch(toastError));
  await draw().catch((err) => {
    if (err.name !== 'AbortError') mount(body, h('div', { class: 'empty' }, h('span', { class: 'big' }, '🌫️'), err.message,
      h('div', {}, h('button', { class: 'btn', type: 'button', onclick: () => render(container, ctx) }, '重试'))));
  });
}

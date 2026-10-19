// Canned Open-Meteo / holiday-cn data and a fetch() that serves it, so tests never touch the network.
import { addDays } from '../shared/dates.js';

const hours = (n, f) => Array.from({ length: n }, (_, i) => f(i));
const pad = (n) => String(n).padStart(2, '0');

export function forecastBody({ code = 61, pop = 70, max = 24, min = 14, uv = 6 } = {}) {
  const day = (i) => addDays('2026-10-17', i); // real calendar arithmetic: the forecast spans a month end
  return {
    timezone: 'Asia/Shanghai',
    current: { time: '2026-10-17T14:00', temperature_2m: 22.4, apparent_temperature: 21.8, relative_humidity_2m: 80, is_day: 1, precipitation: 0.4, weather_code: code, pressure_msl: 1012, wind_speed_10m: 4.2, wind_direction_10m: 90, wind_gusts_10m: 8 },
    hourly: {
      time: hours(48, (i) => `${day(Math.floor((14 + i) / 24))}T${pad((14 + i) % 24)}:00`),
      temperature_2m: hours(48, () => 21), precipitation_probability: hours(48, () => pop), precipitation: hours(48, () => 0.2),
      weather_code: hours(48, () => code), wind_speed_10m: hours(48, () => 4), uv_index: hours(48, () => 3), is_day: hours(48, () => 1),
    },
    daily: {
      time: hours(16, day), weather_code: hours(16, () => code), temperature_2m_max: hours(16, () => max), temperature_2m_min: hours(16, () => min),
      apparent_temperature_max: hours(16, () => max - 1), apparent_temperature_min: hours(16, () => min - 1),
      sunrise: hours(16, (i) => `${day(i)}T05:58`), sunset: hours(16, (i) => `${day(i)}T17:20`), daylight_duration: hours(16, () => 41000),
      uv_index_max: hours(16, () => uv), precipitation_sum: hours(16, () => 3), precipitation_probability_max: hours(16, () => pop),
      wind_speed_10m_max: hours(16, () => 5), wind_gusts_10m_max: hours(16, () => 9),
    },
  };
}

export const airBody = (aqi = 62) => ({
  current: { us_aqi: aqi, pm2_5: 18.2, pm10: 30 },
  hourly: { us_aqi: hours(48, () => aqi) },
});

export const geoBody = {
  results: [
    { name: '杭州', admin1: '浙江', admin2: '杭州市', country: '中国', latitude: 30.29365, longitude: 120.16142 },
    { name: '杭州', admin1: '四川', admin2: '甘孜藏族自治州', country: '中国', latitude: 30.06517, longitude: 102.19527 },
  ],
};

export const holidayBody = (year) => ({
  year,
  days: [
    { name: '国庆节', date: `${year}-10-01`, isOffDay: true },
    { name: '国庆节', date: `${year}-10-10`, isOffDay: false },
    { name: '坏数据', date: 'not-a-date', isOffDay: true },
  ],
});

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/**
 * Routes by URL. `fail` can be set per source: 'forecast' | 'air' | 'geo' | 'holiday'
 * to a status number (HTTP error) or 'network' (throws).
 */
export function fakeFetch({ fail = {}, holidayFail = {} } = {}) {
  const calls = [];
  const impl = async (url) => {
    const u = String(url);
    calls.push(u);
    const source = u.includes('air-quality') ? 'air' : u.includes('geocoding') ? 'geo' : u.includes('open-meteo') ? 'forecast' : 'holiday';
    const mode = source === 'holiday' ? holidayFail[new URL(u).host] ?? fail.holiday : fail[source];
    if (mode === 'network') throw new TypeError('fetch failed');
    if (mode) return json({}, mode);
    if (source === 'air') return json(airBody());
    if (source === 'geo') return u.includes('zzz') ? json({ generationtime_ms: 0.1 }) : json(geoBody);
    if (source === 'forecast') return json(forecastBody());
    return json(holidayBody(+u.match(/(\d{4})\.json/)[1]));
  };
  impl.calls = calls;
  return impl;
}

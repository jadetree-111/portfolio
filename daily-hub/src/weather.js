// Open-Meteo client (no API key): forecast, air quality and city search, with caching.
import { HttpError } from './http.js';

const FORECAST = 'https://api.open-meteo.com/v1/forecast';
const AIR = 'https://air-quality-api.open-meteo.com/v1/air-quality';
const GEO = 'https://geocoding-api.open-meteo.com/v1/search';
const WEATHER_TTL = 10 * 60 * 1000;
const GEO_TTL = 24 * 3600 * 1000;

const CURRENT = 'temperature_2m,apparent_temperature,relative_humidity_2m,is_day,precipitation,weather_code,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m';
const HOURLY = 'temperature_2m,precipitation_probability,precipitation,weather_code,wind_speed_10m,uv_index,is_day';
const DAILY = 'weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,sunrise,sunset,daylight_duration,uv_index_max,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max';

const r2 = (n) => Math.round(n * 100) / 100;

export function normalizeForecast(f, air) {
  const { current: c, hourly: h, daily: d } = f ?? {};
  if (!c || !h?.time || !d?.time) throw new Error('unexpected forecast response');
  return {
    timezone: f.timezone,
    current: {
      time: c.time, temp: c.temperature_2m, feels: c.apparent_temperature, humidity: c.relative_humidity_2m,
      isDay: c.is_day === 1, precip: c.precipitation, code: c.weather_code, pressure: c.pressure_msl,
      wind: c.wind_speed_10m, windDir: c.wind_direction_10m, gust: c.wind_gusts_10m,
    },
    hourly: h.time.map((time, i) => ({
      time, temp: h.temperature_2m[i], pop: h.precipitation_probability[i], precip: h.precipitation[i],
      code: h.weather_code[i], wind: h.wind_speed_10m[i], uv: h.uv_index[i], isDay: h.is_day[i] === 1,
    })),
    daily: d.time.map((date, i) => ({
      date, code: d.weather_code[i], max: d.temperature_2m_max[i], min: d.temperature_2m_min[i],
      feelsMax: d.apparent_temperature_max[i], feelsMin: d.apparent_temperature_min[i],
      sunrise: d.sunrise[i], sunset: d.sunset[i], daylight: d.daylight_duration[i], uvMax: d.uv_index_max[i],
      precipSum: d.precipitation_sum[i], pop: d.precipitation_probability_max[i],
      windMax: d.wind_speed_10m_max[i], gustMax: d.wind_gusts_10m_max[i],
    })),
    air: normalizeAir(air),
  };
}

function normalizeAir(air) {
  const aqi = air?.current?.us_aqi;
  if (aqi == null) return null;
  const next = (air.hourly?.us_aqi ?? []).slice(0, 48).filter((v) => v != null);
  return { aqi, pm25: air.current.pm2_5, pm10: air.current.pm10, maxNext: next.length ? Math.max(...next) : aqi };
}

export function createWeather({ cache, fetchImpl = fetch, timeoutMs = 10000 }) {
  async function getJson(url) {
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs), headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  return {
    async forecast({ lat, lon, name }) {
      const [la, lo] = [r2(lat), r2(lon)];
      const key = `weather:${la},${lo}`;
      const hit = cache.get(key);
      if (hit?.fresh) return { ...hit.value, city: name, stale: false };
      const loc = `latitude=${la}&longitude=${lo}&timezone=auto`;
      try {
        const [forecast, air] = await Promise.all([
          getJson(`${FORECAST}?${loc}&current=${CURRENT}&hourly=${HOURLY}&daily=${DAILY}&forecast_days=16&forecast_hours=48&wind_speed_unit=ms`),
          getJson(`${AIR}?${loc}&current=us_aqi,pm2_5,pm10&hourly=us_aqi&forecast_days=2`).catch(() => null),
        ]);
        const data = normalizeForecast(forecast, air);
        cache.set(key, data, WEATHER_TTL);
        return { ...data, city: name, stale: false };
      } catch {
        if (hit) return { ...hit.value, city: name, stale: true };
        throw new HttpError(502, '天气服务暂时不可用，请稍后再试', 'weather_unavailable');
      }
    },

    async search(query) {
      const q = String(query ?? '').trim().slice(0, 40);
      if (!q) return [];
      const key = `geo:${q.toLowerCase()}`;
      const hit = cache.get(key);
      if (hit?.fresh) return hit.value;
      let body;
      try {
        body = await getJson(`${GEO}?name=${encodeURIComponent(q)}&count=8&language=zh&format=json`);
      } catch {
        throw new HttpError(502, '城市搜索暂时不可用', 'geocode_unavailable');
      }
      const results = (body.results ?? []).map((r) => ({
        name: r.name,
        region: [r.admin1, r.admin2].filter((v, i, a) => v && v !== r.name && a.indexOf(v) === i).join(' · '),
        country: r.country ?? '',
        lat: r2(r.latitude),
        lon: r2(r.longitude),
      }));
      cache.set(key, results, GEO_TTL);
      return results;
    },
  };
}

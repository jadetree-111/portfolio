// WMO weather codes (Open-Meteo) -> Chinese text / emoji, plus scale helpers.
// [text, day icon, night icon, kind]
const CODES = {
  0: ['晴', '☀️', '🌙', 'clear'],
  1: ['大部晴朗', '🌤️', '🌙', 'clear'],
  2: ['局部多云', '⛅', '☁️', 'cloud'],
  3: ['阴', '☁️', '☁️', 'cloud'],
  45: ['雾', '🌫️', '🌫️', 'fog'],
  48: ['冻雾', '🌫️', '🌫️', 'fog'],
  51: ['小毛毛雨', '🌦️', '🌧️', 'rain'],
  53: ['毛毛雨', '🌦️', '🌧️', 'rain'],
  55: ['大毛毛雨', '🌧️', '🌧️', 'rain'],
  56: ['冻毛毛雨', '🌧️', '🌧️', 'rain'],
  57: ['强冻毛毛雨', '🌧️', '🌧️', 'rain'],
  61: ['小雨', '🌦️', '🌧️', 'rain'],
  63: ['中雨', '🌧️', '🌧️', 'rain'],
  65: ['大雨', '🌧️', '🌧️', 'rain'],
  66: ['冻雨', '🌧️', '🌧️', 'rain'],
  67: ['强冻雨', '🌧️', '🌧️', 'rain'],
  71: ['小雪', '🌨️', '🌨️', 'snow'],
  73: ['中雪', '🌨️', '🌨️', 'snow'],
  75: ['大雪', '❄️', '❄️', 'snow'],
  77: ['雪粒', '🌨️', '🌨️', 'snow'],
  80: ['小阵雨', '🌦️', '🌧️', 'rain'],
  81: ['阵雨', '🌧️', '🌧️', 'rain'],
  82: ['强阵雨', '⛈️', '⛈️', 'rain'],
  85: ['小阵雪', '🌨️', '🌨️', 'snow'],
  86: ['大阵雪', '❄️', '❄️', 'snow'],
  95: ['雷暴', '⛈️', '⛈️', 'thunder'],
  96: ['雷暴伴小冰雹', '⛈️', '⛈️', 'thunder'],
  99: ['雷暴伴大冰雹', '⛈️', '⛈️', 'thunder'],
};

export function describeWeather(code, isDay = true) {
  const row = CODES[code];
  if (!row) return { text: '未知', icon: '❔', kind: 'clear' };
  return { text: row[0], icon: isDay ? row[1] : row[2], kind: row[3] };
}

export const isWetCode = (code) => ['rain', 'snow', 'thunder'].includes(CODES[code]?.[3]);

const WIND_LIMITS = [0.3, 1.6, 3.4, 5.5, 8.0, 10.8, 13.9, 17.2, 20.8, 24.5, 28.5, 32.7];
/** Chinese wind force level (0-12) from m/s. */
export const windScale = (ms) => {
  const i = WIND_LIMITS.findIndex((limit) => ms < limit);
  return i === -1 ? 12 : i;
};

const DIRS = ['北', '东北', '东', '东南', '南', '西南', '西', '西北'];
export const windDirection = (deg) => DIRS[Math.round((((deg % 360) + 360) % 360) / 45) % 8];

// US AQI (what Open-Meteo returns). Tone drives the CSS colour class.
export function aqiLevel(aqi) {
  if (aqi == null) return { label: '暂无', tone: 'none' };
  if (aqi <= 50) return { label: '优', tone: 'good' };
  if (aqi <= 100) return { label: '良', tone: 'ok' };
  if (aqi <= 150) return { label: '轻度污染', tone: 'warn' };
  if (aqi <= 200) return { label: '中度污染', tone: 'bad' };
  return { label: aqi <= 300 ? '重度污染' : '严重污染', tone: 'severe' };
}

export function uvLevel(uv) {
  if (uv == null) return { label: '暂无', tone: 'none' };
  if (uv < 3) return { label: '弱', tone: 'good' };
  if (uv < 6) return { label: '中等', tone: 'ok' };
  if (uv < 8) return { label: '强', tone: 'warn' };
  if (uv < 11) return { label: '很强', tone: 'bad' };
  return { label: '极强', tone: 'severe' };
}

import { api } from './api.js';

export const state = { settings: null };

export async function loadSettings() {
  state.settings = await api.get('/api/settings');
  return state.settings;
}

export async function saveSettings(patch) {
  state.settings = await api.patch('/api/settings', patch);
  notifyChange();
  return state.settings;
}

/** Settings in the shape shared/schedule.js expects. */
export const scheduleSettings = () => ({
  semesterStart: state.settings?.semester_start || null,
  periods: state.settings?.periods,
});

/** Views re-fetch when data changes anywhere (a task saved from the add sheet, for example). */
export const notifyChange = () => window.dispatchEvent(new Event('dh:change'));
export function onChange(fn) {
  window.addEventListener('dh:change', fn);
  return () => window.removeEventListener('dh:change', fn);
}

const holidayCache = new Map();
/** Map of 'YYYY-MM-DD' -> { name, off } for a year. Empty when the data source is unreachable. */
export async function holidayMap(year) {
  if (!holidayCache.has(year)) {
    holidayCache.set(year, api.get(`/api/holidays/${year}`)
      .then((r) => ({ map: new Map(r.days.map((d) => [d.date, d])), ok: r.source !== 'none' }))
      .catch(() => ({ map: new Map(), ok: false })));
  }
  const entry = await holidayCache.get(year);
  if (!entry.ok) holidayCache.delete(year); // retry next time
  return entry.map;
}

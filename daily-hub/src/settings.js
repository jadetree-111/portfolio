import crypto from 'node:crypto';
import { isYmd, isHm } from '../shared/dates.js';
import { DEFAULT_PERIODS } from '../shared/schedule.js';

export const DEFAULTS = {
  semester_start: '',
  week_start: 1,
  periods: DEFAULT_PERIODS,
  city: { name: '上海', lat: 31.23, lon: 121.47 },
  show_lunar: true,
  remind_default_min: 30,
};

const clean = (s, max) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

const VALIDATORS = {
  semester_start: (v) => (v === '' || isYmd(v) ? v : undefined),
  week_start: (v) => (v === 1 || v === 7 ? v : undefined),
  show_lunar: (v) => (typeof v === 'boolean' ? v : undefined),
  // null = no automatic reminder
  remind_default_min: (v) => (v === null || (Number.isInteger(v) && v >= 0 && v <= 1440) ? v : undefined),
  city: (v) => {
    const lat = Number(v?.lat);
    const lon = Number(v?.lon);
    const name = clean(v?.name, 40);
    return name && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180 ? { name, lat, lon } : undefined;
  },
  periods: (v) => {
    if (!Array.isArray(v) || v.length < 1 || v.length > 20) return undefined;
    const rows = v.map((p, i) => ({ n: i + 1, start: p?.start, end: p?.end }));
    return rows.every((p) => isHm(p.start) && isHm(p.end) && p.start < p.end) ? rows : undefined;
  },
};

export function createSettings(db) {
  const all = db.prepare('SELECT key, value FROM settings');
  const put = db.prepare('INSERT INTO settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  const del = db.prepare('DELETE FROM settings WHERE key = ?');

  const raw = () => Object.fromEntries(all.all().map((r) => [r.key, JSON.parse(r.value)]));
  return {
    /** Public settings merged over defaults. */
    get: () => ({ ...DEFAULTS, ...Object.fromEntries(Object.entries(raw()).filter(([k]) => Object.hasOwn(VALIDATORS, k))) }),
    /** All-or-nothing: nothing is written unless every key is known and valid. Returns the rejected keys. */
    update(patch) {
      const accepted = [];
      const rejected = [];
      for (const [key, value] of Object.entries(patch ?? {})) {
        const ok = Object.hasOwn(VALIDATORS, key) ? VALIDATORS[key](value) : undefined; // own keys only: "constructor" must not match
        if (ok === undefined) rejected.push(key);
        else accepted.push([key, ok]);
      }
      if (!rejected.length) for (const [key, value] of accepted) put.run(key, JSON.stringify(value));
      return rejected;
    },
    /** Capability token for the read-only calendar feed; created lazily. */
    feedToken(rotate = false) {
      const row = raw().feed_token;
      if (row && !rotate) return row;
      const token = crypto.randomBytes(18).toString('base64url');
      put.run('feed_token', JSON.stringify(token));
      return token;
    },
    revokeFeed: () => del.run('feed_token'),
    hasFeed: () => Boolean(raw().feed_token),
  };
}

// China statutory holidays and make-up workdays (NateScarlet/holiday-cn dataset).
// Tries several mirrors, caches in sqlite, and serves stale data when every mirror is down.
import { isYmd } from '../shared/dates.js';

const PATH = (year) => `gh/NateScarlet/holiday-cn@master/${year}.json`;
const MIRRORS = [
  (y) => `https://fastly.jsdelivr.net/${PATH(y)}`,
  (y) => `https://cdn.jsdelivr.net/${PATH(y)}`,
  (y) => `https://raw.githubusercontent.com/NateScarlet/holiday-cn/master/${y}.json`,
];
const FRESH_MS = 7 * 24 * 3600 * 1000;
const UNPUBLISHED_MS = 12 * 3600 * 1000;
const RETRY_MS = 10 * 60 * 1000;

function normalize(body, year) {
  if (!body || body.year !== year || !Array.isArray(body.days)) return null;
  return body.days
    .filter((d) => isYmd(d?.date) && typeof d.name === 'string')
    .map((d) => ({ date: d.date, name: d.name.slice(0, 20), off: Boolean(d.isOffDay) }));
}

async function fetchYear(year, fetchImpl, timeoutMs) {
  let missing = false;
  for (const build of MIRRORS) {
    try {
      const res = await fetchImpl(build(year), { signal: AbortSignal.timeout(timeoutMs), headers: { accept: 'application/json' } });
      if (res.status === 404) { missing = true; continue; }
      if (!res.ok) continue;
      const days = normalize(await res.json(), year);
      if (days) return { days };
    } catch { /* network error or bad JSON: try the next mirror */ }
  }
  return missing ? { days: [], unpublished: true } : null;
}

export function createHolidays({ cache, fetchImpl = fetch, timeoutMs = 8000 }) {
  const inflight = new Map();
  return {
    /** { year, days: [{date,name,off}], source: 'cache'|'live'|'stale'|'none' } */
    async year(year) {
      const key = `holiday:${year}`;
      const hit = cache.get(key);
      if (hit?.fresh) return { year, days: hit.value.days, source: hit.value.failed ? 'none' : 'cache' };

      if (!inflight.has(year)) {
        inflight.set(year, fetchYear(year, fetchImpl, timeoutMs).finally(() => inflight.delete(year)));
      }
      const live = await inflight.get(year);
      if (live) {
        cache.set(key, { days: live.days }, live.unpublished ? UNPUBLISHED_MS : FRESH_MS);
        return { year, days: live.days, source: 'live' };
      }
      if (hit && !hit.value.failed) {
        cache.set(key, hit.value, RETRY_MS); // keep serving the old copy, retry later
        return { year, days: hit.value.days, source: 'stale' };
      }
      cache.set(key, { days: [], failed: true }, RETRY_MS); // avoid hammering dead mirrors
      return { year, days: [], source: 'none' };
    },
  };
}

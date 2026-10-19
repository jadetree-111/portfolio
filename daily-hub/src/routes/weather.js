import { raw } from '../router.js';
import { badRequest, notFound, safeEqual } from '../http.js';
import { addDays } from '../../shared/dates.js';
import { buildTips } from '../../shared/weather-tips.js';
import { buildIcs } from '../ics.js';

export function weatherRoutes({ router, weather, holidays, settings }) {
  router.get('/api/cities', async ({ query }) => ({ results: await weather.search(query.get('q')) }));

  // Uses the saved city unless lat/lon are given (for previewing another city).
  router.get('/api/weather', async ({ query }) => {
    const saved = settings.get().city;
    let city = saved;
    if (query.has('lat') || query.has('lon')) {
      const lat = Number(query.get('lat'));
      const lon = Number(query.get('lon'));
      if (!(Math.abs(lat) <= 90 && Math.abs(lon) <= 180) || query.get('lat') === '' || query.get('lon') === '') {
        throw badRequest('经纬度不正确');
      }
      city = { name: (query.get('name') || '').slice(0, 40), lat, lon };
    }
    const forecast = await weather.forecast(city);
    return { ...forecast, tips: buildTips(forecast) };
  });

  router.get('/api/holidays/:year', ({ params }) => {
    const year = Number(params.year);
    if (!Number.isInteger(year) || year < 2000 || year > 2100) throw badRequest('年份不正确');
    return holidays.year(year);
  });
}

/** Public, but only answers to the feed token. Subscribed calendars cannot send cookies. */
export function icsRoutes({ router, settings, tasks, courses, today }) {
  router.get('/calendar.ics', ({ query }) => {
    const token = query.get('token') ?? '';
    if (!settings.hasFeed() || !safeEqual(token, settings.feedToken())) throw notFound();
    const start = today();
    const ics = buildIcs({
      tasks: tasks.list({ from: addDays(start, -30), to: addDays(start, 365), done: false }),
      courses: courses.list(),
      settings: settings.get(),
      today: start,
    });
    return raw(200, ics, { 'content-type': 'text/calendar; charset=utf-8', 'cache-control': 'no-cache' });
  }, { public: true });
}

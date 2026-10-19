import test from 'node:test';
import assert from 'node:assert/strict';
import { boot } from './helpers.js';
import { fakeFetch } from './fakes.js';

test('weather: normalised forecast with tips, cached, and stale data when the network dies', async (t) => {
  const fail = {};
  const fetchImpl = fakeFetch({ fail });
  const s = await boot({ fetchImpl });
  t.after(s.close);

  const res = await s.request('/api/weather');
  assert.equal(res.status, 200, res.text);
  assert.equal(res.data.city, '上海');
  assert.equal(res.data.current.temp, 22.4);
  assert.equal(res.data.daily.length, 16);
  assert.equal(res.data.hourly.length, 48);
  assert.equal(res.data.air.aqi, 62);
  assert.ok(res.data.tips.some((x) => x.id === 'rain' && x.level === 'warn'));
  assert.equal(res.data.stale, false);

  const calls = fetchImpl.calls.length;
  await s.request('/api/weather');
  assert.equal(fetchImpl.calls.length, calls, 'second request is served from cache');

  s.app.db.exec('UPDATE cache SET expires_at = 1');
  fail.forecast = 'network';
  const stale = await s.request('/api/weather');
  assert.equal(stale.status, 200);
  assert.equal(stale.data.stale, true);

  fail.air = 500;
  s.app.db.exec('DELETE FROM cache');
  fail.forecast = undefined;
  const noAir = await s.request('/api/weather');
  assert.equal(noAir.data.air, null, 'air quality is optional');

  s.app.db.exec('DELETE FROM cache');
  fail.forecast = 503;
  assert.equal((await s.request('/api/weather')).status, 502);
});

test('weather: parameters are validated; city search is cached; city is saved in settings', async (t) => {
  const fetchImpl = fakeFetch();
  const s = await boot({ fetchImpl });
  t.after(s.close);
  assert.equal((await s.request('/api/weather?lat=abc&lon=1')).status, 400);
  assert.equal((await s.request('/api/weather?lat=91&lon=1')).status, 400);
  assert.equal((await s.request('/api/weather?lat=&lon=')).status, 400);

  const found = await s.request(`/api/cities?q=${encodeURIComponent('杭州')}`);
  assert.equal(found.data.results.length, 2);
  assert.equal(found.data.results[0].region, '浙江 · 杭州市');
  const before = fetchImpl.calls.length;
  await s.request(`/api/cities?q=${encodeURIComponent('杭州')}`);
  assert.equal(fetchImpl.calls.length, before);
  assert.deepEqual((await s.request('/api/cities?q=')).data.results, []);
  assert.deepEqual((await s.request('/api/cities?q=zzzz')).data.results, []);

  const city = { name: '杭州', lat: 30.29, lon: 120.16 };
  assert.deepEqual((await s.request('/api/settings', { method: 'PATCH', json: { city } })).data.city, city);
  await s.request('/api/weather');
  assert.ok(fetchImpl.calls.some((u) => u.includes('latitude=30.29') && u.includes('longitude=120.16')));
  assert.equal((await s.request('/api/settings', { method: 'PATCH', json: { city: { name: 'x', lat: 999, lon: 0 } } })).status, 400);
});

test('holidays: mirrors fail over, bad rows are dropped, dead sources are not hammered', async (t) => {
  const holidayFail = { 'fastly.jsdelivr.net': 'network' };
  const fetchImpl = fakeFetch({ holidayFail });
  const s = await boot({ fetchImpl });
  t.after(s.close);

  const ok = await s.request('/api/holidays/2026');
  assert.equal(ok.data.source, 'live');
  assert.deepEqual(ok.data.days.map((d) => d.date), ['2026-10-01', '2026-10-10']);
  assert.deepEqual(ok.data.days[1], { date: '2026-10-10', name: '国庆节', off: false });
  assert.ok(fetchImpl.calls.some((u) => u.includes('fastly.jsdelivr.net')) && fetchImpl.calls.some((u) => u.includes('cdn.jsdelivr.net')));
  assert.equal((await s.request('/api/holidays/2026')).data.source, 'cache');

  holidayFail['fastly.jsdelivr.net'] = 'network';
  holidayFail['cdn.jsdelivr.net'] = 'network';
  holidayFail['raw.githubusercontent.com'] = 'network';
  s.app.db.exec('UPDATE cache SET expires_at = 1');
  assert.equal((await s.request('/api/holidays/2026')).data.source, 'stale');

  const none = await s.request('/api/holidays/2027');
  assert.equal(none.data.source, 'none');
  const calls = fetchImpl.calls.length;
  await s.request('/api/holidays/2027');
  assert.equal(fetchImpl.calls.length, calls, 'a failed year is not retried on every request');

  holidayFail['fastly.jsdelivr.net'] = 404;
  holidayFail['cdn.jsdelivr.net'] = 404;
  holidayFail['raw.githubusercontent.com'] = 404;
  const future = await s.request('/api/holidays/2031');
  assert.deepEqual(future.data.days, []);
  assert.equal((await s.request('/api/holidays/1999')).status, 400);
  assert.equal((await s.request('/api/holidays/abc')).status, 400);
});

test('calendar feed: token gated, valid iCalendar with alarms, courses and all-day items', async (t) => {
  const s = await boot();
  t.after(s.close);
  assert.equal((await s.request('/calendar.ics?token=anything')).status, 404);
  assert.equal((await s.request('/api/feed')).data.enabled, false);

  await s.request('/api/tasks', { method: 'POST', json: { title: '开会, 带电脑; 准备PPT', date: '2026-10-20', time: '09:30', end_time: '10:30', remind_min: 15, location: '会议室A' } });
  await s.request('/api/tasks', { method: 'POST', json: { title: '交报告', kind: 'deadline', date: '2026-10-21' } });
  await s.request('/api/tasks', { method: 'POST', json: { title: '已完成的事', date: '2026-10-22', time: '08:00' } });
  await s.request('/api/tasks/3', { method: 'PATCH', json: { done: true } });
  await s.request('/api/tasks', { method: 'POST', json: { title: '这是一个非常非常长的标题'.repeat(8), date: '2026-10-23' } });
  await s.request('/api/settings', { method: 'PATCH', json: { semester_start: '2026-09-07' } });
  await s.request('/api/courses', { method: 'POST', json: { name: '高数', weekday: 1, start_period: 1, end_period: 2, weeks: [1, 2], location: 'A301', teacher: '李' } });

  const { token } = (await s.request('/api/feed', { method: 'POST', json: {} })).data;
  assert.ok(token.length >= 20);
  s.setCookie(''); // calendar apps cannot send our session cookie
  assert.equal((await s.request('/calendar.ics')).status, 404);
  assert.equal((await s.request('/calendar.ics?token=wrong')).status, 404);
  const res = await s.request(`/calendar.ics?token=${token}`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /^text\/calendar/);

  const ics = res.text;
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n') && ics.endsWith('END:VCALENDAR\r\n'));
  assert.ok(!/(^|[^\r])\n/.test(ics), 'CRLF line endings only');
  assert.match(ics, /DTSTART:20261020T093000\r\nDTEND:20261020T103000/);
  assert.match(ics, /SUMMARY:开会\\, 带电脑\\; 准备PPT/);
  assert.match(ics, /BEGIN:VALARM\r\nACTION:DISPLAY\r\nDESCRIPTION:[^\r]*\r\nTRIGGER:-PT15M\r\nEND:VALARM/);
  assert.match(ics, /DTSTART;VALUE=DATE:20261021\r\nDTEND;VALUE=DATE:20261022/);
  assert.match(ics, /SUMMARY:截止 · 交报告/);
  assert.ok(!ics.includes('已完成的事'));
  assert.match(ics, /UID:course-1-2026-09-07@daily-hub/);
  assert.match(ics, /UID:course-1-2026-09-14@daily-hub/);
  assert.ok(!ics.includes('course-1-2026-09-21'));
  assert.match(ics, /DTSTART:20260907T080000\r\nDTEND:20260907T094000/); // periods 1-2 = 08:00-09:40
  for (const line of ics.split('\r\n')) assert.ok(Buffer.byteLength(line) <= 75, `line too long: ${line.length}`);

  // The cookie is needed to manage the feed, and rotating the token kills the old link.
  await s.signIn();
  const rotated = (await s.request('/api/feed', { method: 'POST', json: { rotate: true } })).data.token;
  assert.notEqual(rotated, token);
  s.setCookie('');
  assert.equal((await s.request(`/calendar.ics?token=${token}`)).status, 404);
  await s.signIn();
  assert.equal((await s.request('/api/feed', { method: 'DELETE' })).status, 204);
  s.setCookie('');
  assert.equal((await s.request(`/calendar.ics?token=${rotated}`)).status, 404);
});

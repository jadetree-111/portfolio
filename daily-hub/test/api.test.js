import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { boot, rawRequest, PNG } from './helpers.js';

test('API requires login; login is case-insensitive and issues a cookie', async (t) => {
  const s = await boot({ login: false });
  t.after(s.close);
  assert.equal((await s.request('/api/tasks')).status, 401);
  const session = await s.request('/api/session');
  assert.deepEqual(session.data, { authRequired: true, authenticated: false });
  assert.equal((await s.request('/api/login', { method: 'POST', json: { code: 'wrong' } })).status, 401);
  const ok = await s.signIn();
  assert.equal(ok.status, 200);
  assert.match(ok.headers.get('set-cookie'), /HttpOnly; SameSite=Lax/);
  assert.equal((await s.request('/api/tasks')).status, 200);
  assert.equal((await s.request('/api/session')).data.authenticated, true);
  s.setCookie('dh_session=v1.9999999999999.forged');
  assert.equal((await s.request('/api/tasks')).status, 401);
});

test('five wrong codes lock the client out, even for the right code', async (t) => {
  const s = await boot({ login: false });
  t.after(s.close);
  for (let i = 0; i < 5; i++) await s.request('/api/login', { method: 'POST', json: { code: 'nope' } });
  const locked = await s.request('/api/login', { method: 'POST', json: { code: 'testcode' } });
  assert.equal(locked.status, 429);
  assert.equal(locked.data.code, 'locked');
});

test('rejects foreign Host headers and cross-site writes', async (t) => {
  const s = await boot();
  t.after(s.close);
  assert.equal((await rawRequest(s.base, { path: '/', headers: { host: 'evil.example.com' } })).status, 403);
  assert.equal((await rawRequest(s.base, { path: '/', headers: { host: '192.168.1.5:3210' } })).status, 200);
  const cross = await s.request('/api/tasks', { method: 'POST', json: { title: 'x' }, headers: { origin: 'http://evil.example.com' } });
  assert.equal(cross.status, 403);
  const form = await s.request('/api/tasks', { method: 'POST', body: 'title=x', headers: { 'content-type': 'application/x-www-form-urlencoded' } });
  assert.equal(form.status, 415);
});

test('static files: security headers present, traversal and dotfiles refused', async (t) => {
  const s = await boot();
  t.after(s.close);
  const home = await s.request('/');
  assert.equal(home.status, 200);
  assert.match(home.headers.get('content-security-policy'), /default-src 'self'/);
  assert.equal(home.headers.get('x-content-type-options'), 'nosniff');
  for (const p of ['/..%2f..%2fpackage.json', '/%2e%2e/server.js', '/.env', '/data/daily-hub.db', '/..\\server.js']) {
    assert.notEqual((await s.request(p)).status, 200, p);
  }
  assert.equal((await rawRequest(s.base, { path: '/../../server.js' })).status === 200, false);
});

test('tasks: CRUD, validation and cross-field rules on patch', async (t) => {
  const s = await boot();
  t.after(s.close);
  assert.equal((await s.request('/api/tasks', { method: 'POST', json: { title: '' } })).status, 400);
  assert.equal((await s.request('/api/tasks', { method: 'POST', json: { title: 'a', time: '09:00' } })).data.code, 'time_needs_date');
  assert.equal((await s.request('/api/tasks', { method: 'POST', json: { title: 'a', date: '2026-02-30' } })).data.code, 'bad_date');

  const made = await s.request('/api/tasks', { method: 'POST', json: { title: '  交报告  ', date: '2026-10-20', time: '09:30', remind_min: 15 } });
  assert.equal(made.status, 201);
  const { id } = made.data;
  assert.equal(made.data.title, '交报告');

  const noDate = await s.request(`/api/tasks/${id}`, { method: 'PATCH', json: { date: null } });
  assert.equal(noDate.status, 400); // time and reminder still set
  const done = await s.request(`/api/tasks/${id}`, { method: 'PATCH', json: { done: true } });
  assert.equal(done.data.done, true);
  assert.ok(done.data.done_at);

  const list = await s.request('/api/tasks?from=2026-10-01&to=2026-10-31&done=true');
  assert.equal(list.data.length, 1);
  assert.equal((await s.request('/api/tasks?from=bad')).status, 400);
  assert.equal((await s.request('/api/tasks?q=%25')).data.length, 0); // % is literal, not a wildcard

  assert.equal((await s.request(`/api/tasks/${id}`, { method: 'DELETE' })).status, 204);
  assert.equal((await s.request(`/api/tasks/${id}`)).status, 404);
  assert.equal((await s.request('/api/tasks/abc')).status, 404);
});

test('batch save keeps good rows and reports bad ones', async (t) => {
  const s = await boot();
  t.after(s.close);
  const res = await s.request('/api/tasks/batch', { method: 'POST', json: { items: [{ title: 'ok' }, { title: '' }, { title: 'ok2', date: '2026-10-20' }] } });
  assert.equal(res.status, 201);
  assert.equal(res.data.created.length, 2);
  assert.deepEqual(res.data.errors.map((e) => e.index), [1]);
});

test('images: sniffed by content, deduplicated, served back, junk refused', async (t) => {
  const s = await boot();
  t.after(s.close);
  const up = await s.request('/api/images', { method: 'POST', body: PNG, headers: { 'content-type': 'image/png' } });
  assert.equal(up.status, 201);
  assert.equal(up.data.mime, 'image/png');
  const again = await s.request('/api/images', { method: 'POST', body: PNG, headers: { 'content-type': 'image/png' } });
  assert.equal(again.data.id, up.data.id);
  assert.equal(again.data.duplicate, true);
  const fake = await s.request('/api/images', { method: 'POST', body: '<svg onload=alert(1)>', headers: { 'content-type': 'image/png' } });
  assert.equal(fake.status, 415);
  assert.equal((await s.request('/api/images', { method: 'POST', body: PNG, headers: { 'content-type': 'text/html' } })).status, 415);
  const got = await s.request(`/api/images/${up.data.id}`);
  assert.equal(got.status, 200);
  assert.equal(got.headers.get('content-type'), 'image/png');
  assert.equal((await s.request('/api/images/..%2f..%2fsecret.key')).status, 404);
  const tiny = await boot({ env: { MAX_IMAGE_MB: '0.00001' } });
  t.after(tiny.close);
  assert.equal((await tiny.request('/api/images', { method: 'POST', body: PNG, headers: { 'content-type': 'image/png' } })).status, 413);
});

test('settings: all-or-nothing updates; prototype-ish keys are rejected, not stored or fatal', async (t) => {
  const s = await boot();
  t.after(s.close);
  const mixed = await s.request('/api/settings', { method: 'PATCH', json: { semester_start: '2026-09-07', week_start: 3 } });
  assert.equal(mixed.status, 400);
  assert.equal((await s.request('/api/settings')).data.semester_start, '', 'the valid half was not applied');
  for (const body of ['{"constructor":"x"}', '{"__proto__":1}', '{"toString":2}', '{"hasOwnProperty":1}']) {
    const res = await s.request('/api/settings', { method: 'PATCH', body, headers: { 'content-type': 'application/json' } });
    assert.equal(res.status, 400, body);
  }
  const rows = s.app.db.prepare('SELECT key FROM settings').all();
  assert.deepEqual(rows, [], 'nothing leaked into the settings table');
  assert.equal(Object.hasOwn((await s.request('/api/settings')).data, 'constructor'), false);
});

test('images: a duplicate upload repairs a file that was deleted by hand', async (t) => {
  const s = await boot();
  t.after(s.close);
  const up = await s.request('/api/images', { method: 'POST', body: PNG, headers: { 'content-type': 'image/png' } });
  const file = path.join(s.dir, 'images', `${up.data.id}.png`);
  fs.rmSync(file);
  assert.equal((await s.request(`/api/images/${up.data.id}`)).status, 404);
  const again = await s.request('/api/images', { method: 'POST', body: PNG, headers: { 'content-type': 'image/png' } });
  assert.equal(again.data.id, up.data.id);
  assert.equal((await s.request(`/api/images/${up.data.id}`)).status, 200);
});

test('courses: import replaces atomically; settings validate', async (t) => {
  const s = await boot();
  t.after(s.close);
  const course = { name: '高数', weekday: 1, start_period: 1, end_period: 2, weeks: [1, 2, 3] };
  await s.request('/api/courses', { method: 'POST', json: course });
  const imp = await s.request('/api/courses/import', { method: 'POST', json: { mode: 'replace', courses: [{ ...course, name: '线代' }, { name: '', weekday: 9 }] } });
  assert.equal(imp.data.created.length, 1);
  assert.equal(imp.data.errors.length, 1);
  const list = await s.request('/api/courses');
  assert.deepEqual(list.data.map((c) => c.name), ['线代']);
  assert.equal((await s.request('/api/courses/import', { method: 'POST', json: { courses: [{ name: '' }] } })).status, 400);
  assert.equal((await s.request('/api/settings', { method: 'PATCH', json: { semester_start: '2026-09-07' } })).data.semester_start, '2026-09-07');
  assert.equal((await s.request('/api/settings', { method: 'PATCH', json: { semester_start: 'soon' } })).status, 400);
  assert.equal((await s.request('/api/settings', { method: 'PATCH', json: { feed_token: 'x' } })).status, 400);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { boot, PNG } from './helpers.js';
import { startFakeAnthropic, callerFor } from './fake-anthropic.js';

const TASKS_REPLY = JSON.stringify({
  tasks: [
    { title: '参加班会', details: '带学生证', kind: 'event', date: '2026-10-18', time: '15:30', end_time: null, location: '图书馆三楼', priority: 'high', tags: ['班级'], source_text: '明天下午3点半班会' },
    { title: '参加班会', details: '', kind: 'event', date: '2026-10-18', time: '15:30', end_time: null, location: '', priority: 'normal', tags: [], source_text: 'dup' },
    { title: '交实验报告', details: '', kind: 'deadline', date: '2031-01-01', time: '23:00', end_time: null, location: '', priority: 'normal', tags: [], source_text: '' },
    { title: '', details: '', kind: 'todo', date: null, time: null, end_time: null, location: '', priority: 'normal', tags: [], source_text: '' },
  ],
  notes: '',
});

const TIMETABLE_REPLY = JSON.stringify({
  courses: [
    { name: '高等数学', teacher: '李老师', location: 'A301', weekday: 1, start_period: 1, end_period: 2, start_time: null, end_time: null, week_ranges: [{ from: 1, to: 8, parity: 'odd' }, { from: 10, to: 12, parity: 'all' }] },
    { name: '', teacher: '', location: '', weekday: 2, start_period: 1, end_period: 1, start_time: null, end_time: null, week_ranges: [] },
    { name: '大学英语', teacher: '', location: '', weekday: 9, start_period: 3, end_period: 4, start_time: null, end_time: null, week_ranges: [] },
  ],
  periods: [{ n: 1, start: '08:00', end: '08:45' }, { n: 2, start: '08:55', end: '09:40' }],
  warnings: ['周五下午有一格看不清'],
});

async function setup(t, { fake = {}, env = {}, configured } = {}) {
  const api = await startFakeAnthropic(fake);
  const caller = callerFor(api.url);
  const s = await boot({ caller, env, configured });
  t.after(async () => { await s.close(); await api.close(); });
  const upload = async () => (await s.request('/api/images', { method: 'POST', body: PNG, headers: { 'content-type': 'image/png' } })).data.id;
  return { s, api, caller, upload };
}

test('task extraction: request shape, sanitized result, de-duplication and date sanity', async (t) => {
  const { s, api, upload } = await setup(t, { fake: { reply: TASKS_REPLY } });
  const id = await upload();
  const res = await s.request('/api/ai/tasks', { method: 'POST', json: { imageIds: [id], text: '补充：别迟到' } });
  assert.equal(res.status, 200, res.text);
  assert.equal(res.data.tasks.length, 2); // duplicate and untitled rows dropped
  assert.equal(res.data.tasks[0].title, '参加班会');
  assert.equal(res.data.tasks[0].priority, 'high');
  assert.equal(res.data.tasks[1].date, null); // 2031 is implausible and gets cleared
  assert.match(res.data.warnings[0], /离今天太远/);

  const { body, headers, url } = api.requests[0];
  assert.match(url, /^\/v1\/messages/);
  assert.equal(body.model, 'claude-opus-5-5');
  assert.equal(body.stream, true);
  assert.equal(body.output_config.format.type, 'json_schema');
  assert.equal(body.output_config.format.schema.additionalProperties, false);
  assert.equal(body.output_config.effort, 'medium');
  assert.equal(body.fallbacks, 'default');
  assert.match(headers['anthropic-beta'], /server-side-fallback-2026-07-01/);
  assert.equal(body.thinking, undefined);
  assert.equal(body.tool_choice, undefined);
  assert.equal(body.temperature, undefined);
  const content = body.messages[0].content;
  assert.equal(content[0].type, 'image');
  assert.equal(content[0].source.media_type, 'image/png');
  assert.equal(content.at(-1).type, 'text'); // image before text
  assert.match(content.at(-1).text, /2026-10-17（周六）/);
  assert.match(content.at(-1).text, /别迟到/);
  assert.equal(body.messages.length, 1); // no assistant prefill
});

test('a gateway that rejects fallbacks is handled once, then remembered', async (t) => {
  const { s, api, caller, upload } = await setup(t, {
    fake: { reply: TASKS_REPLY, reject: (body) => (body.fallbacks ? { message: 'fallbacks: Extra inputs are not permitted' } : null) },
  });
  const id = await upload();
  assert.equal((await s.request('/api/ai/tasks', { method: 'POST', json: { imageIds: [id] } })).status, 200);
  assert.deepEqual(caller.dropped(), ['fallbacks']);
  assert.equal(api.requests.length, 2);
  assert.equal((await s.request('/api/ai/tasks', { method: 'POST', json: { imageIds: [id] } })).status, 200);
  assert.equal(api.requests.length, 3); // straight to the working shape
  assert.equal(api.requests[2].body.fallbacks, undefined);
  assert.equal(api.requests[2].body.output_config.format.type, 'json_schema');
});

test('timetable extraction expands week ranges and reports what it skipped', async (t) => {
  const { s, api, upload } = await setup(t, { fake: { reply: TIMETABLE_REPLY } });
  const id = await upload();
  const res = await s.request('/api/ai/timetable', { method: 'POST', json: { imageIds: [id] } });
  assert.equal(res.status, 200, res.text);
  assert.equal(res.data.courses.length, 1);
  assert.deepEqual(res.data.courses[0].weeks, [1, 3, 5, 7, 10, 11, 12]);
  assert.equal(res.data.courses[0].location, 'A301');
  assert.equal(res.data.periods.length, 2);
  assert.ok(res.data.warnings.some((w) => w.includes('看不清')));
  assert.ok(res.data.warnings.some((w) => w.includes('大学英语')));
  assert.equal(api.requests[0].body.output_config.effort, 'high');
});

test('guards: missing credentials, hourly budget, bad ids, refusals, truncation', async (t) => {
  const off = await setup(t, { fake: { reply: TASKS_REPLY }, configured: () => false });
  assert.equal((await off.s.request('/api/ai/tasks', { method: 'POST', json: { text: 'x' } })).data.code, 'ai_not_configured');

  const { s, upload } = await setup(t, { fake: { reply: TASKS_REPLY }, env: { AI_HOURLY_LIMIT: '1' } });
  assert.equal((await s.request('/api/ai/tasks', { method: 'POST', json: {} })).status, 400);
  const bad = await s.request('/api/ai/tasks', { method: 'POST', json: { imageIds: ['11111111-1111-1111-1111-111111111111'] } });
  assert.equal(bad.data.code, 'image_missing');
  assert.equal((await s.request('/api/ai/tasks', { method: 'POST', json: { imageIds: ['../../etc/passwd'] } })).status, 400);
  assert.equal((await s.request('/api/ai/tasks', { method: 'POST', json: { text: '明天开会' } })).status, 200);
  const limited = await s.request('/api/ai/tasks', { method: 'POST', json: { text: '明天开会' } });
  assert.equal(limited.status, 429);
  assert.equal(limited.data.code, 'ai_budget');
  assert.equal((await s.request('/api/ai/status')).data.remaining, 0);
  void upload;

  const refused = await setup(t, { fake: { reply: '', stopReason: 'refusal' } });
  assert.equal((await refused.s.request('/api/ai/tasks', { method: 'POST', json: { text: 'x' } })).data.code, 'ai_refused');
  const cut = await setup(t, { fake: { reply: '{"tasks":[', stopReason: 'max_tokens' } });
  assert.equal((await cut.s.request('/api/ai/tasks', { method: 'POST', json: { text: 'x' } })).data.code, 'ai_truncated');
  const junk = await setup(t, { fake: { reply: 'sorry, I cannot do that' } });
  assert.equal((await junk.s.request('/api/ai/tasks', { method: 'POST', json: { text: 'x' } })).data.code, 'ai_bad_output');
});

test('model output wrapped in a code fence still parses; upstream auth errors are explained', async (t) => {
  const fenced = await setup(t, { fake: { reply: `\`\`\`json\n${TASKS_REPLY}\n\`\`\`` } });
  assert.equal((await fenced.s.request('/api/ai/tasks', { method: 'POST', json: { text: 'x' } })).data.tasks.length, 2);
  const denied = await setup(t, { fake: { reject: () => ({ status: 401, message: 'invalid x-api-key' }) } });
  const res = await denied.s.request('/api/ai/tasks', { method: 'POST', json: { text: 'x' } });
  assert.equal(res.status, 502);
  assert.equal(res.data.code, 'ai_auth');
});

import { reply } from '../router.js';
import { badRequest, notFound } from '../http.js';
import { cleanTask } from '../tasks.js';
import { isYmd } from '../../shared/dates.js';

const idOf = (params) => {
  const id = Number(params.id);
  if (!Number.isInteger(id) || id < 1) throw notFound('任务不存在');
  return id;
};

function listOptions(query) {
  const opts = {};
  for (const key of ['from', 'to']) {
    const v = query.get(key);
    if (!v) continue;
    if (!isYmd(v)) throw badRequest(`${key} 日期格式应为 YYYY-MM-DD`);
    opts[key] = v;
  }
  const done = query.get('done');
  if (done === 'true' || done === 'false') opts.done = done === 'true';
  const q = query.get('q');
  if (q) opts.q = q.slice(0, 80);
  return opts;
}

export function taskRoutes({ router, repo }) {
  router.get('/api/tasks', ({ query }) => repo.list(listOptions(query)));

  router.get('/api/tasks/:id', ({ params }) => {
    const task = repo.get(idOf(params));
    if (!task) throw notFound('任务不存在');
    return task;
  });

  router.post('/api/tasks', async ({ json }) => reply(201, repo.create(cleanTask(await json()))));

  router.patch('/api/tasks/:id', async ({ params, json }) => repo.update(idOf(params), cleanTask(await json(), { partial: true })));

  router.delete('/api/tasks/:id', ({ params }) => {
    repo.remove(idOf(params));
    return reply(204, null);
  });

  // Saves what the user confirmed from an AI preview. Bad rows are reported, good rows still saved.
  router.post('/api/tasks/batch', async ({ json }) => {
    const body = await json();
    if (!Array.isArray(body?.items)) throw badRequest('格式不正确');
    const errors = [];
    const valid = [];
    body.items.slice(0, 100).forEach((item, index) => {
      try { valid.push(cleanTask(item)); } catch (err) { errors.push({ index, reason: err.message }); }
    });
    return reply(201, { created: repo.createMany(valid), errors });
  });

  router.post('/api/tasks/clear-done', () => ({ removed: repo.clearDone() }));
}

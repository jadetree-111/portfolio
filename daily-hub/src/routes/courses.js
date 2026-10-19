import { reply } from '../router.js';
import { badRequest, notFound } from '../http.js';
import { cleanCourse } from '../courses.js';

const idOf = (params) => {
  const id = Number(params.id);
  if (!Number.isInteger(id) || id < 1) throw notFound('课程不存在');
  return id;
};

export function courseRoutes({ router, repo }) {
  router.get('/api/courses', () => repo.list());

  router.post('/api/courses', async ({ json }) => reply(201, repo.create(cleanCourse(await json()))));

  router.patch('/api/courses/:id', async ({ params, json }) => repo.update(idOf(params), await json()));

  router.delete('/api/courses/:id', ({ params }) => {
    repo.remove(idOf(params));
    return reply(204, null);
  });

  // Saves a confirmed AI timetable. 'replace' swaps the whole timetable in one transaction.
  router.post('/api/courses/import', async ({ json }) => {
    const body = await json();
    if (!Array.isArray(body?.courses)) throw badRequest('格式不正确');
    const errors = [];
    const valid = [];
    body.courses.slice(0, 300).forEach((course, index) => {
      try { valid.push(cleanCourse(course)); } catch (err) { errors.push({ index, reason: err.message }); }
    });
    if (!valid.length) throw badRequest('没有可导入的课程', 'nothing_to_import');
    return reply(201, { created: repo.importMany(valid, body.mode === 'append' ? 'append' : 'replace'), errors });
  });

  router.post('/api/courses/clear', () => {
    repo.clear();
    return reply(204, null);
  });
}

import { badRequest } from '../http.js';

const strings = (v) => (Array.isArray(v) ? v.filter((s) => typeof s === 'string') : []);

export function aiRoutes({ router, extractor, today }) {
  router.get('/api/ai/status', () => extractor.status());

  router.post('/api/ai/tasks', async ({ json, signal }) => {
    const body = await json();
    if (!body || typeof body !== 'object') throw badRequest('请求格式不正确');
    return extractor.tasks({
      imageIds: strings(body.imageIds),
      text: typeof body.text === 'string' ? body.text : '',
      stitched: body.stitched === true,
      today: today(),
      signal,
    });
  });

  router.post('/api/ai/timetable', async ({ json, signal }) => {
    const body = await json();
    if (!body || typeof body !== 'object') throw badRequest('请求格式不正确');
    return extractor.timetable({ imageIds: strings(body.imageIds), stitched: body.stitched === true, signal });
  });
}

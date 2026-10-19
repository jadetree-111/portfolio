import { reply, raw } from '../router.js';
import { HttpError, notFound } from '../http.js';

export function imageRoutes({ router, images, config }) {
  // The body is the raw image bytes (the browser sends the Blob as-is): no multipart parsing needed.
  router.post('/api/images', async ({ req, body }) => {
    const type = String(req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
    if (!type.startsWith('image/')) throw new HttpError(415, '请上传图片文件', 'bad_image_type');
    return reply(201, images.save(await body(config.maxImageBytes), config.maxImageBytes));
  });

  router.get('/api/images/:id', ({ params }) => {
    const image = images.read(params.id);
    if (!image) throw notFound('图片不存在');
    return raw(200, image.data, { 'content-type': image.mime, 'cache-control': 'private, max-age=31536000, immutable' });
  });
}

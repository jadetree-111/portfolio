import os from 'node:os';
import { reply } from '../router.js';
import { badRequest } from '../http.js';

const lanUrls = (port) => Object.values(os.networkInterfaces()).flat()
  .filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => `http://${i.address}:${port}`);

export function settingsRoutes({ router, settings, config }) {
  router.get('/api/settings', () => settings.get());
  router.get('/api/info', () => ({ lan: config.host === '0.0.0.0' ? lanUrls(config.port) : [], port: config.port }));

  router.patch('/api/settings', async ({ json }) => {
    const body = await json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw badRequest('格式不正确');
    const rejected = settings.update(body);
    if (rejected.length) throw badRequest(`这些设置不合法：${rejected.join('、')}`, 'bad_settings');
    return settings.get();
  });

  // Calendar subscription (read-only .ics). The token is the credential, so it can be rotated or revoked.
  router.get('/api/feed', () => ({ enabled: settings.hasFeed(), token: settings.hasFeed() ? settings.feedToken() : null }));
  router.post('/api/feed', async ({ json }) => {
    const body = await json();
    return { enabled: true, token: settings.feedToken(body?.rotate === true) };
  });
  router.delete('/api/feed', () => {
    settings.revokeFeed();
    return reply(204, null);
  });
}

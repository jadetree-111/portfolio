import { reply } from '../router.js';
import { HttpError, parseCookies, clientIp } from '../http.js';
import { COOKIE } from '../auth.js';

export function authRoutes({ router, auth }) {
  const signedIn = (req) => !auth.enabled || auth.verify(parseCookies(req.headers.cookie)[COOKIE]);

  router.get('/api/session', ({ req }) => ({ authRequired: auth.enabled, authenticated: signedIn(req) }), { public: true });

  router.post('/api/login', async ({ req, json }) => {
    if (!auth.enabled) return { ok: true };
    const body = await json();
    const result = auth.check(clientIp(req), body?.code);
    if (!result.ok) {
      if (result.retryAfterMs) {
        const minutes = Math.ceil(result.retryAfterMs / 60000);
        throw new HttpError(429, `尝试次数过多，请 ${minutes} 分钟后再试`, 'locked', { retryAfter: Math.ceil(result.retryAfterMs / 1000) });
      }
      throw new HttpError(401, '口令不正确', 'bad_code');
    }
    const secure = req.headers['x-forwarded-proto'] === 'https';
    return reply(200, { ok: true }, { 'set-cookie': auth.cookie(auth.issue(), secure) });
  }, { public: true });

  router.post('/api/logout', () => reply(200, { ok: true }, { 'set-cookie': auth.clearCookie() }), { public: true });
}

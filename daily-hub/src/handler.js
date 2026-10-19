// Request pipeline: security headers -> Host check -> static files or API (origin, auth, dispatch).
import { HttpError, notFound, sendJson, sendText, readJson, readBody, parseCookies } from './http.js';
import { Reply } from './router.js';
import { COOKIE } from './auth.js';
import { SECURITY_HEADERS, isSameOrigin } from './security.js';

function send(res, result) {
  if (!(result instanceof Reply)) return sendJson(res, 200, result ?? {});
  const { status, body, headers, raw } = result;
  if (body == null) {
    res.writeHead(status, { 'cache-control': 'no-store', ...headers });
    return res.end();
  }
  if (raw) {
    res.writeHead(status, { 'content-length': Buffer.byteLength(body), ...headers });
    return res.end(body);
  }
  return sendJson(res, status, body, headers);
}

function sendError(res, err, log) {
  if (res.headersSent) return res.destroy();
  if (err instanceof HttpError) return sendJson(res, err.status, { error: err.message, code: err.code, ...err.extra });
  log(err);
  return sendJson(res, 500, { error: '服务器出错了，请稍后再试', code: 'internal' });
}

export function createHandler({ router, auth, hostAllowed, serveStatic, log = console.error }) {
  return async function handle(req, res) {
    try {
      for (const [name, value] of Object.entries(SECURITY_HEADERS)) res.setHeader(name, value);
      if (!hostAllowed(req.headers.host)) throw new HttpError(403, '不允许通过这个地址访问', 'bad_host');

      const url = new URL(req.url, 'http://localhost');
      const isApi = url.pathname.startsWith('/api/') || url.pathname === '/calendar.ics';
      if (!isApi) {
        if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, '不支持的请求方法', 'method_not_allowed');
        if (await serveStatic(req, res, url.pathname)) return;
        return sendText(res, 404, 'Not found');
      }

      const hit = router.match(req.method, url.pathname);
      if (!hit) throw notFound('接口不存在');
      if (hit === 'method') throw new HttpError(405, '不支持的请求方法', 'method_not_allowed');
      if (req.method !== 'GET' && !isSameOrigin(req)) throw new HttpError(403, '跨站请求已被拒绝', 'cross_site');
      if (!hit.route.isPublic && auth.enabled && !auth.verify(parseCookies(req.headers.cookie)[COOKIE])) {
        throw new HttpError(401, '请先登录', 'unauthorized');
      }

      // Aborts when the client goes away before we finish, so a cancelled AI call stops spending tokens.
      const aborter = new AbortController();
      res.once('close', () => { if (!res.writableFinished) aborter.abort(); });

      const result = await hit.route.handler({
        req,
        url,
        query: url.searchParams,
        params: hit.params,
        json: () => readJson(req),
        body: (limit) => readBody(req, limit),
        signal: aborter.signal,
      });
      send(res, result);
    } catch (err) {
      sendError(res, err, log);
    }
  };
}

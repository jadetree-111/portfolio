// Minimal router: ":param" segments, per-route options and explicit reply objects.
export class Reply {
  constructor(status, body, headers = {}, raw = false) {
    Object.assign(this, { status, body, headers, raw });
  }
}
/** JSON reply with a custom status/headers. Plain return values are sent as 200 JSON. */
export const reply = (status, body, headers) => new Reply(status, body, headers);
/** Pre-encoded body (string or Buffer); the caller supplies content-type. */
export const raw = (status, body, headers) => new Reply(status, body, headers, true);

const safeDecode = (s) => {
  try { return decodeURIComponent(s); } catch { return null; }
};

export function createRouter() {
  const routes = [];
  const add = (method) => (pattern, handler, opts = {}) => {
    const keys = [];
    const source = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; });
    const re = new RegExp(`^${source}$`);
    routes.push({ method, re, keys, handler, isPublic: Boolean(opts.public) });
  };
  return {
    get: add('GET'),
    post: add('POST'),
    patch: add('PATCH'),
    delete: add('DELETE'),
    /** { route, params } | 'method' (path exists, wrong method) | null */
    match(method, pathname) {
      let pathHit = false;
      for (const route of routes) {
        const m = route.re.exec(pathname);
        if (!m) continue;
        pathHit = true;
        if (route.method !== method) continue;
        const values = route.keys.map((_, i) => safeDecode(m[i + 1]));
        if (values.includes(null)) return null;
        return { route, params: Object.fromEntries(route.keys.map((k, i) => [k, values[i]])) };
      }
      return pathHit ? 'method' : null;
    },
  };
}

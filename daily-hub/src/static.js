import fs from 'node:fs/promises';
import path from 'node:path';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

/** Maps URL prefixes to directories; the first matching prefix wins, so list '/' last. */
export function createStaticSites(sites) {
  const mounted = Object.entries(sites).map(([prefix, dir]) => ({ prefix, serve: createStatic(dir) }));
  return (req, res, pathname) => {
    const site = mounted.find((s) => pathname.startsWith(s.prefix));
    return site ? site.serve(req, res, `/${pathname.slice(site.prefix.length)}`) : false;
  };
}

/**
 * Serves files from `root`. Returns true when it sent a response, false when nothing matched.
 * Revalidates on every load (ETag), so edits show up without a hard refresh.
 */
export function createStatic(root) {
  const base = path.resolve(root);
  return async function serve(req, res, pathname) {
    let rel;
    try { rel = decodeURIComponent(pathname); } catch { return false; }
    if (rel.includes('\0') || rel.includes('\\')) return false;
    if (rel.endsWith('/')) rel += 'index.html';

    const file = path.join(base, rel);
    if (file !== base && !file.startsWith(base + path.sep)) return false;
    const type = TYPES[path.extname(file).toLowerCase()];
    if (!type) return false;

    let stat;
    try { stat = await fs.stat(file); } catch { return false; }
    if (!stat.isFile()) return false;

    const etag = `"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
    const headers = { 'content-type': type, etag, 'cache-control': 'no-cache' };
    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304, headers);
      res.end();
      return true;
    }
    res.writeHead(200, { ...headers, 'content-length': stat.size });
    if (req.method === 'HEAD') { res.end(); return true; }
    res.end(await fs.readFile(file));
    return true;
  };
}

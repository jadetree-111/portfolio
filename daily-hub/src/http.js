import crypto from 'node:crypto';
import { Buffer } from 'node:buffer';

export class HttpError extends Error {
  constructor(status, message, code = 'error', extra = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

export const badRequest = (message, code = 'bad_request') => new HttpError(400, message, code);
export const notFound = (message = '未找到') => new HttpError(404, message, 'not_found');

export function sendJson(res, status, body, headers = {}) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(data),
    'cache-control': 'no-store',
    ...headers,
  });
  res.end(data);
}

export function sendText(res, status, text, type = 'text/plain; charset=utf-8', headers = {}) {
  res.writeHead(status, { 'content-type': type, 'content-length': Buffer.byteLength(text), ...headers });
  res.end(text);
}

export async function readBody(req, limit) {
  if (Number(req.headers['content-length']) > limit) throw new HttpError(413, '内容过大', 'too_large');
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new HttpError(413, '内容过大', 'too_large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/** JSON bodies only. Requiring the JSON content type also blocks cross-site form posts. */
export async function readJson(req, limit = 256 * 1024) {
  if (!/^application\/json\b/i.test(req.headers['content-type'] ?? '')) {
    throw new HttpError(415, '请求必须是 JSON', 'unsupported_media_type');
  }
  const body = await readBody(req, limit);
  if (!body.length) return {};
  try {
    return JSON.parse(body.toString('utf8'));
  } catch {
    throw badRequest('JSON 格式错误', 'invalid_json');
  }
}

export function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

export const hostOf = (req) => String(req.headers.host ?? '').toLowerCase();

/** Hostname without port, handling [::1]. */
export function hostnameOf(host) {
  if (host.startsWith('[')) return host.slice(0, host.indexOf(']') + 1);
  return host.split(':')[0];
}

export const clientIp = (req) => String(req.socket.remoteAddress ?? '').replace(/^::ffff:/, '');

/** Constant-time string comparison (digests first, so lengths never leak). */
export function safeEqual(a, b) {
  const hash = (s) => crypto.createHash('sha256').update(String(s)).digest();
  return crypto.timingSafeEqual(hash(a), hash(b));
}

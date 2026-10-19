import net from 'node:net';
import { hostnameOf } from './http.js';

export const SECURITY_HEADERS = {
  'content-security-policy': [
    "default-src 'self'", "script-src 'self'", "style-src 'self'", "img-src 'self' data: blob:",
    "connect-src 'self'", "object-src 'none'", "base-uri 'none'", "form-action 'self'", "frame-ancestors 'none'",
  ].join('; '),
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer',
  'cross-origin-opener-policy': 'same-origin',
};

/**
 * Host header allowlist, which stops DNS-rebinding. IP literals, localhost, single-label LAN
 * names and *.local are always fine; any other domain must be listed in ALLOWED_HOSTS.
 */
export function createHostGuard(extraHosts = []) {
  const extra = new Set(extraHosts.map((h) => h.toLowerCase()));
  return (hostHeader) => {
    const host = String(hostHeader ?? '').toLowerCase();
    const name = hostnameOf(host);
    if (!name) return false;
    if (net.isIP(name.replace(/^\[|\]$/g, ''))) return true;
    if (name === 'localhost' || name.endsWith('.localhost') || name.endsWith('.local') || !name.includes('.')) return true;
    return extra.has(name) || extra.has(host);
  };
}

/** Browsers attach Origin to cross-site writes; if it names another host, refuse. */
export function isSameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host.toLowerCase() === String(req.headers.host ?? '').toLowerCase();
  } catch {
    return false;
  }
}

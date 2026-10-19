import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const COOKIE = 'dh_session';
const SESSION_MS = 30 * 24 * 3600 * 1000;
const MAX_FAILS = 5;
const LOCK_MS = 15 * 60 * 1000;

const sha = (s) => crypto.createHash('sha256').update(s).digest();

function loadSecret(dataDir) {
  const file = path.join(dataDir, 'secret.key');
  try {
    const hex = fs.readFileSync(file, 'utf8').trim();
    if (/^[0-9a-f]{64}$/.test(hex)) return Buffer.from(hex, 'hex');
  } catch { /* first run */ }
  const secret = crypto.randomBytes(32);
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(file, secret.toString('hex'), { mode: 0o600 });
  return secret;
}

export function createAuth({ dataDir, accessCode, now = Date.now }) {
  // Mixing the code into the key means changing ACCESS_CODE signs everyone out.
  const key = crypto.createHmac('sha256', loadSecret(dataDir)).update(accessCode).digest();
  const sign = (payload) => crypto.createHmac('sha256', key).update(payload).digest('base64url');
  const fails = new Map(); // ip -> { count, until }

  function lockedFor(ip) {
    const entry = fails.get(ip);
    if (!entry) return 0;
    if (entry.until && entry.until > now()) return entry.until - now();
    if (entry.until) fails.delete(ip);
    return 0;
  }

  return {
    enabled: Boolean(accessCode),
    issue() {
      const payload = `v1.${now() + SESSION_MS}`;
      return `${payload}.${sign(payload)}`;
    },
    verify(token) {
      const m = /^(v1\.(\d+))\.([\w-]+)$/.exec(token ?? '');
      if (!m || Number(m[2]) < now()) return false;
      const a = sha(sign(m[1]));
      return crypto.timingSafeEqual(a, sha(m[3]));
    },
    cookie: (token, secure = false) => `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MS / 1000}${secure ? '; Secure' : ''}`,
    clearCookie: () => `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
    lockedFor,
    /** Case-insensitive on purpose: codes are typed on phone keyboards. */
    check(ip, code) {
      const wait = lockedFor(ip);
      if (wait) return { ok: false, retryAfterMs: wait };
      const ok = crypto.timingSafeEqual(sha(String(code ?? '').trim().toLowerCase()), sha(accessCode.toLowerCase()));
      if (ok) {
        fails.delete(ip);
        return { ok: true };
      }
      const entry = fails.get(ip) ?? { count: 0, until: 0 };
      entry.count += 1;
      if (entry.count >= MAX_FAILS) Object.assign(entry, { count: 0, until: now() + LOCK_MS });
      fails.set(ip, entry);
      return { ok: false, retryAfterMs: entry.until ? entry.until - now() : 0 };
    },
  };
}

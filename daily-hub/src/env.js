// .env loading. Values in .env win over inherited environment variables,
// so the app behaves the same whether started from a terminal or by double-click.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { parseEnv } from 'node:util';

export const ROOT = path.resolve(import.meta.dirname, '..');
const ENV_FILE = path.join(ROOT, '.env');
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I

export function loadEnv() {
  if (!fs.existsSync(ENV_FILE)) return;
  const parsed = parseEnv(fs.readFileSync(ENV_FILE, 'utf8'));
  for (const [key, value] of Object.entries(parsed)) {
    if (value !== '') process.env[key] = value; // blank placeholders never clobber real values
  }
}

export function generateAccessCode(length = 8) {
  return Array.from({ length }, () => CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)]).join('');
}

/** First run: make sure a login code exists, persisting it to .env. Returns { code, created }. */
export function ensureAccessCode() {
  if (process.env.ACCESS_CODE) return { code: process.env.ACCESS_CODE, created: false };
  const code = generateAccessCode();
  const existing = fs.existsSync(ENV_FILE) ? fs.readFileSync(ENV_FILE, 'utf8') : '';
  const line = `ACCESS_CODE=${code}\n`;
  const next = /^ACCESS_CODE=.*$/m.test(existing)
    ? existing.replace(/^ACCESS_CODE=.*$/m, line.trim())
    : `${existing}${existing && !existing.endsWith('\n') ? '\n' : ''}# 登录口令（首次启动自动生成，可自行修改）\n${line}`;
  fs.writeFileSync(ENV_FILE, next, { encoding: 'utf8', mode: 0o600 });
  process.env.ACCESS_CODE = code;
  return { code, created: true };
}

import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';

// 1x1 transparent PNG
export const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

/** Boots the real server on a random port with an isolated data dir and injected fakes. */
export async function boot({ env = {}, caller, fetchImpl, today = () => '2026-10-17', configured = () => true, login = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dh-test-'));
  const config = loadConfig({ DATA_DIR: dir, ACCESS_CODE: 'TESTCODE', ...env });
  const app = createApp({ config, caller, fetchImpl, today, configured, log: () => {} });
  const server = http.createServer(app.handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let cookie = '';

  const request = async (url, { method = 'GET', json, body, headers = {} } = {}) => {
    const h = { ...headers };
    if (cookie) h.cookie = cookie;
    let payload = body;
    if (json !== undefined) {
      h['content-type'] = 'application/json';
      payload = JSON.stringify(json);
    }
    const res = await fetch(base + url, { method, headers: h, body: payload, redirect: 'manual' });
    const text = await res.text();
    let data = null;
    try { data = JSON.parse(text); } catch { /* not JSON */ }
    return { status: res.status, headers: res.headers, text, data };
  };

  const signIn = async () => {
    const res = await request('/api/login', { method: 'POST', json: { code: 'testcode' } });
    cookie = res.headers.get('set-cookie')?.split(';')[0] ?? '';
    return res;
  };
  if (login) await signIn();

  return {
    base, app, request, signIn, dir,
    setCookie: (value) => { cookie = value; },
    close: async () => {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
      app.close();
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

/** Raw HTTP request, for headers fetch will not let us set (Host). */
export function rawRequest(base, { path: urlPath = '/', headers = {}, method = 'GET' } = {}) {
  const { hostname, port } = new URL(base);
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname, port, path: urlPath, method, headers }, (res) => {
      let text = '';
      res.on('data', (c) => { text += c; });
      res.on('end', () => resolve({ status: res.statusCode, text }));
    });
    req.on('error', reject);
    req.end();
  });
}

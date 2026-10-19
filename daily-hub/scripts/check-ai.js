// Checks that AI extraction works with the credentials in .env: `npm run check:ai`.
// Sends one short text-only request (a few hundred tokens) through the same code path the app uses.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadEnv } from '../src/env.js';
import { localYmd } from '../shared/dates.js';

loadEnv();
const { loadConfig } = await import('../src/config.js');
const { createApp } = await import('../src/app.js');
const { isConfigured } = await import('../src/ai/call.js');

if (!isConfigured()) {
  console.error('未配置 AI：请在 .env 填写 ANTHROPIC_API_KEY（或 ANTHROPIC_BASE_URL + ANTHROPIC_AUTH_TOKEN）。');
  process.exit(1);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dh-check-'));
const app = createApp({ config: { ...loadConfig(), dataDir: tmp }, log: console.error });
const sample = '通知：明天下午3点半在图书馆三楼报告厅开班会，请带学生证，务必准时。另外周五前交实验报告。';
let code = 0;
try {
  const t0 = Date.now();
  const result = await app.extractor.tasks({ text: sample, today: localYmd() });
  console.log(`模型 ${app.extractor.status().model} · 用时 ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log('服务端不支持而被自动关闭的功能：', app.caller.dropped().join('、') || '无');
  console.log(JSON.stringify(result.tasks, null, 2));
  if (!result.tasks.length) { console.error('没有识别出任何事项，请检查模型名和网关。'); code = 1; }
} catch (err) {
  console.error(`失败：${err.message}${err.code ? `（${err.code}）` : ''}`);
  code = 1;
} finally {
  app.close();
  fs.rmSync(tmp, { recursive: true, force: true });
}
// Not process.exit(): on Windows it can abort inside libuv while HTTP sockets are still closing.
process.exitCode = code;

import http from 'node:http';
import os from 'node:os';
import { loadEnv, ensureAccessCode } from './src/env.js';

loadEnv();
const { code, created } = ensureAccessCode();

const { loadConfig } = await import('./src/config.js');
const { createApp } = await import('./src/app.js');
const { isConfigured } = await import('./src/ai/call.js');

const config = loadConfig();
const app = createApp({ config });
const server = http.createServer(app.handler);

// Slow-loris protection; AI calls are long but the request itself arrives quickly.
server.headersTimeout = 20_000;
server.requestTimeout = 120_000;

server.on('error', (err) => {
  console.error(err.code === 'EADDRINUSE' ? `端口 ${config.port} 已被占用，请在 .env 里改 PORT` : err);
  process.exit(1);
});

server.listen(config.port, config.host, () => {
  const lan = Object.values(os.networkInterfaces()).flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address);
  console.log('\n  Daily Hub 已启动');
  console.log(`  本机访问    http://localhost:${config.port}`);
  if (config.host === '0.0.0.0') lan.forEach((ip) => console.log(`  手机访问    http://${ip}:${config.port}   （手机需与电脑在同一 Wi-Fi）`));
  console.log(`  登录口令    ${code}${created ? '   （首次启动自动生成，已保存到 .env）' : ''}`);
  console.log(isConfigured() ? `  AI 识别     已配置，模型 ${config.ai.model}` : '  AI 识别     未配置：在 .env 填写 ANTHROPIC_API_KEY 后重启即可启用');
  console.log('');
});

function shutdown() {
  server.close(() => { app.close(); process.exit(0); });
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

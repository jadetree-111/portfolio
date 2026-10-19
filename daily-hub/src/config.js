import path from 'node:path';
import { ROOT } from './env.js';

const positive = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};
const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];
const effort = (value, fallback) => (EFFORTS.includes(value) ? value : fallback);

export function loadConfig(env = process.env) {
  return {
    root: ROOT,
    port: positive(env.PORT, 3210),
    host: env.HOST || '0.0.0.0',
    dataDir: path.resolve(ROOT, env.DATA_DIR || 'data'),
    accessCode: env.ACCESS_CODE || '',
    allowedHosts: (env.ALLOWED_HOSTS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
    maxImageBytes: positive(env.MAX_IMAGE_MB, 5) * 1024 * 1024, // the browser downsizes photos before upload
    ai: {
      model: env.AI_MODEL || 'claude-opus-5-5',
      taskEffort: effort(env.AI_EFFORT_TASKS, 'medium'),
      timetableEffort: effort(env.AI_EFFORT_TIMETABLE, 'high'),
      hourlyLimit: positive(env.AI_HOURLY_LIMIT, 40),
      timeoutMs: positive(env.AI_TIMEOUT_SECONDS, 150) * 1000,
      maxTokens: positive(env.AI_MAX_TOKENS, 32000),
      // Optional request features to never send (for gateways that reject them): fallbacks,format,effort
      disabled: (env.AI_DISABLE || '').split(',').map((s) => s.trim()).filter(Boolean),
    },
  };
}

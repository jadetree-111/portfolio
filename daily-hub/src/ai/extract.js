import { HttpError, badRequest } from '../http.js';
import { AiError, isConfigured } from './call.js';
import { TASKS_SCHEMA, TIMETABLE_SCHEMA } from './schemas.js';
import { TASKS_SYSTEM, TIMETABLE_SYSTEM, tasksUserText, timetableUserText } from './prompts.js';
import { sanitizeTasks, sanitizeTimetable, parseModelJson } from './sanitize.js';

const MAX_IMAGES = 6;
const MAX_TEXT = 4000;
const MAX_CONCURRENT = 2;
const MAX_TOTAL_BYTES = 22 * 1024 * 1024;

export function createExtractor({ config, db, images, caller, configured = isConfigured }) {
  const countRecent = db.prepare('SELECT COUNT(*) AS n FROM ai_calls WHERE ts > ?');
  const record = db.prepare('INSERT INTO ai_calls(ts, kind, model, input_tokens, output_tokens, ok) VALUES (?, ?, ?, ?, ?, ?)');
  let inFlight = 0;

  function guard() {
    if (!configured()) {
      throw new AiError(503, '还没有配置 AI 密钥。把 ANTHROPIC_API_KEY（或 ANTHROPIC_BASE_URL + ANTHROPIC_AUTH_TOKEN）写进 .env 后重启即可', 'ai_not_configured');
    }
    if (countRecent.get(Date.now() - 3_600_000).n >= config.ai.hourlyLimit) {
      throw new AiError(429, `这一小时的 AI 识别次数已达上限（${config.ai.hourlyLimit} 次），可在 .env 调整 AI_HOURLY_LIMIT`, 'ai_budget');
    }
    if (inFlight >= MAX_CONCURRENT) throw new AiError(429, '已有识别任务在进行中，请稍等片刻', 'ai_busy');
  }

  function imageBlocks(ids) {
    if (!Array.isArray(ids) || ids.length > MAX_IMAGES) throw badRequest(`一次最多处理 ${MAX_IMAGES} 张图片`);
    let total = 0;
    const blocks = ids.map((id) => {
      const image = images.read(id);
      if (!image) throw badRequest('图片不存在或已被删除，请重新上传', 'image_missing');
      total += image.data.length;
      return { type: 'image', source: { type: 'base64', media_type: image.mime, data: image.data.toString('base64') } };
    });
    // The API caps a whole request at 32 MB and base64 adds a third, so stay well under.
    if (total > MAX_TOTAL_BYTES) throw new HttpError(413, '图片总体积过大，请减少图片数量或裁剪后再试', 'too_large');
    return blocks;
  }

  async function run(kind, { ids, system, userText, schema, effort, signal }) {
    const blocks = imageBlocks(ids);
    guard();
    inFlight += 1;
    let usage = null;
    let ok = false;
    try {
      const message = await caller.call({
        model: config.ai.model,
        max_tokens: config.ai.maxTokens,
        system,
        messages: [{ role: 'user', content: [...blocks, { type: 'text', text: userText }] }],
        schema,
        effort,
      }, { signal, timeoutMs: config.ai.timeoutMs });
      usage = message.usage;
      if (message.stop_reason === 'refusal') throw new AiError(422, '模型拒绝处理这份内容，请换一张图试试', 'ai_refused');
      if (message.stop_reason === 'max_tokens') throw new AiError(422, '内容太多，一次没能识别完，请裁剪后分批上传', 'ai_truncated');
      const raw = parseModelJson(message.content.filter((b) => b.type === 'text').map((b) => b.text).join(''));
      if (!raw) throw new AiError(502, 'AI 返回的内容无法解析，请重试', 'ai_bad_output');
      ok = true;
      return raw;
    } finally {
      inFlight -= 1;
      record.run(Date.now(), kind, config.ai.model, usage?.input_tokens ?? null, usage?.output_tokens ?? null, ok ? 1 : 0);
    }
  }

  return {
    status: () => ({
      configured: configured(),
      model: config.ai.model,
      remaining: Math.max(0, config.ai.hourlyLimit - countRecent.get(Date.now() - 3_600_000).n),
    }),
    async tasks({ imageIds = [], text = '', stitched = false, today, signal }) {
      const note = String(text ?? '').trim().slice(0, MAX_TEXT);
      if (!imageIds.length && !note) throw badRequest('请提供图片或文字');
      const raw = await run('tasks', {
        ids: imageIds, system: TASKS_SYSTEM, schema: TASKS_SCHEMA, effort: config.ai.taskEffort, signal,
        userText: tasksUserText({ today, text: note, stitched }),
      });
      return sanitizeTasks(raw, today);
    },
    async timetable({ imageIds = [], stitched = false, signal }) {
      if (!imageIds.length) throw badRequest('请先选择课表图片');
      const raw = await run('timetable', {
        ids: imageIds, system: TIMETABLE_SYSTEM, schema: TIMETABLE_SCHEMA, effort: config.ai.timetableEffort, signal,
        userText: timetableUserText({ stitched }),
      });
      return sanitizeTimetable(raw);
    },
  };
}

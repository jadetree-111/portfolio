// One place that talks to the model. Uses the official SDK with streaming, and
// steps down gracefully when a gateway rejects optional request features.
import Anthropic from '@anthropic-ai/sdk';
import { HttpError } from '../http.js';

export class AiError extends HttpError {}

const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

// Optional request features, in the order they are given up when the server's complaint is vague.
// Structured output goes last: it is the one that keeps the reply parseable. `hint` recognises a
// server naming a feature; effort is listed before format because "output_config.effort" must not
// be mistaken for the format setting that shares the output_config object.
const FEATURES = [
  { name: 'fallbacks', hint: /fallback|anthropic-beta|\bbetas?\b/i },
  { name: 'effort', hint: /\beffort\b/i },
  { name: 'format', hint: /output_config|json_schema|structured|output_format|response_format|\bschema\b/i },
];

export const isConfigured = (env = process.env) => Boolean(env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN);

// Errors that are clearly about the request's content or the account, not about an optional feature.
// Retrying these without a feature would only re-upload the images for the same failure.
const UNRELATED = /image|media_type|base64|too large|exceeds|payload|content.?length|\bmodel\b|credit|balance|quota/i;

/** Which optional feature a 400/404/422 points at, or the next one in line when the message is vague. */
export function featureToDrop(err, dropped) {
  if (!(err instanceof Anthropic.APIError) || ![400, 404, 422].includes(err.status)) return null;
  const message = upstreamNote(err);
  const named = FEATURES.find((f) => !dropped.has(f.name) && f.hint.test(message));
  if (named) return named.name;
  if (UNRELATED.test(message)) return null;
  return FEATURES.find((f) => !dropped.has(f.name))?.name ?? null;
}

// The SDK's err.message embeds the whole JSON body; the server's own sentence is in err.error.error.message.
const upstreamNote = (err) => String(err.error?.error?.message ?? err.message ?? '').slice(0, 160);

/** Maps SDK errors (most specific first) to errors the UI can show. */
export function toAiError(err) {
  if (err instanceof HttpError) return err;
  if (err instanceof Anthropic.APIUserAbortError) return new AiError(499, '已取消', 'ai_aborted');
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    return new AiError(502, 'AI 密钥无效或没有权限，请检查 .env 里的密钥和地址', 'ai_auth');
  }
  if (err instanceof Anthropic.NotFoundError) return new AiError(502, '找不到所选模型，请检查 .env 里的 AI_MODEL', 'ai_model');
  if (err instanceof Anthropic.RateLimitError) return new AiError(429, 'AI 服务请求过多，请稍后再试', 'ai_rate_limit');
  if (err instanceof Anthropic.BadRequestError || err instanceof Anthropic.UnprocessableEntityError) {
    return new AiError(422, `AI 无法处理这个请求：${upstreamNote(err)}`, 'ai_bad_request');
  }
  if (err instanceof Anthropic.APIConnectionTimeoutError) return new AiError(504, 'AI 响应超时，请重试', 'ai_timeout');
  if (err instanceof Anthropic.APIConnectionError) {
    return new AiError(502, '连不上 AI 服务，请检查网络或 ANTHROPIC_BASE_URL', 'ai_connection');
  }
  if (err instanceof Anthropic.APIError) return new AiError(502, 'AI 服务暂时不可用，请稍后再试', 'ai_upstream');
  return err;
}

function buildParams({ schema, effort, ...rest }, dropped) {
  const output_config = {};
  if (effort && !dropped.has('effort')) output_config.effort = effort;
  if (schema && !dropped.has('format')) output_config.format = { type: 'json_schema', schema };
  const params = { ...rest };
  if (Object.keys(output_config).length) params.output_config = output_config;
  if (!dropped.has('fallbacks')) Object.assign(params, { betas: [FALLBACK_BETA], fallbacks: 'default' });
  return params;
}

/**
 * @param getClient lazily builds the SDK client, so the server can start without credentials
 * @param disabled  features to never send, for a gateway known to reject them
 *
 * A feature is dropped for good only after a retry without it succeeds, so an unrelated
 * 400 (an oversized image, say) can never switch features off permanently.
 */
export function createCaller({ getClient, disabled = [], log = console.warn }) {
  const dropped = new Set(disabled);
  return {
    dropped: () => [...dropped],
    async call(base, { signal, timeoutMs }) {
      const trial = new Set(dropped);
      let firstError = null;
      for (let attempt = 0; attempt <= FEATURES.length; attempt++) {
        const client = getClient();
        const api = trial.has('fallbacks') ? client.messages : client.beta.messages;
        try {
          const message = await api.stream(buildParams(base, trial), { signal, timeout: timeoutMs, maxRetries: 1 }).finalMessage();
          const added = [...trial].filter((f) => !dropped.has(f));
          if (added.length) {
            added.forEach((f) => dropped.add(f));
            log(`[ai] 服务端不支持 ${added.join('、')}，已自动关闭（可在 .env 写 AI_DISABLE=${[...dropped].join(',')} 固定）`);
          }
          return message;
        } catch (err) {
          firstError ??= err;
          const feature = featureToDrop(err, trial);
          if (!feature || signal?.aborted) throw toAiError(firstError);
          trial.add(feature);
        }
      }
      throw toAiError(firstError);
    },
  };
}

export function createClientFactory() {
  let client = null;
  return () => (client ??= new Anthropic({ maxRetries: 1 }));
}

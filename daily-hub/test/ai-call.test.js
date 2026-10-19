import test from 'node:test';
import assert from 'node:assert/strict';
import Anthropic from '@anthropic-ai/sdk';
import { createCaller, featureToDrop, toAiError, AiError } from '../src/ai/call.js';

const apiError = (status, message) =>
  Anthropic.APIError.generate(status, { type: 'error', error: { type: 'invalid_request_error', message } }, undefined, new Headers());

/** Fake SDK client. `script` entries are consumed in order: an Error is thrown, anything else is returned. */
function fakeClient(script) {
  const calls = [];
  const make = (path) => ({
    stream: (params, opts) => {
      calls.push({ path, params, opts });
      const next = script.shift();
      return { finalMessage: async () => { if (next instanceof Error) throw next; return next; } };
    },
  });
  return { calls, client: { messages: make('messages'), beta: { messages: make('beta') } } };
}

const BASE = { model: 'm', max_tokens: 10, system: 's', messages: [], schema: { type: 'object' }, effort: 'medium' };
const OK = { stop_reason: 'end_turn', content: [], usage: {} };
const silent = () => {};

test('featureToDrop prefers the feature the server names, else the next one in line', () => {
  const none = new Set();
  assert.equal(featureToDrop(apiError(400, 'fallbacks: Extra inputs are not permitted'), none), 'fallbacks');
  assert.equal(featureToDrop(apiError(400, 'output_config.format is not supported'), none), 'format');
  assert.equal(featureToDrop(apiError(400, 'effort is not supported for this model'), none), 'effort');
  assert.equal(featureToDrop(apiError(400, 'output_config.effort: Extra inputs are not permitted'), none), 'effort', 'effort is not mistaken for format');
  assert.equal(featureToDrop(apiError(400, 'Bad request'), none), 'fallbacks');
  assert.equal(featureToDrop(apiError(400, 'Bad request'), new Set(['fallbacks'])), 'effort');
  assert.equal(featureToDrop(apiError(400, 'Bad request'), new Set(['fallbacks', 'effort'])), 'format', 'structured output is given up last');
  assert.equal(featureToDrop(apiError(400, 'Bad request'), new Set(['fallbacks', 'format', 'effort'])), null);
  assert.equal(featureToDrop(apiError(401, 'fallbacks'), none), null);
  assert.equal(featureToDrop(apiError(429, 'slow'), none), null);
  assert.equal(featureToDrop(new Error('boom'), none), null);
});

test('a rejected feature is dropped only once the retry succeeds, then stays dropped', async () => {
  const { client, calls } = fakeClient([apiError(400, 'fallbacks: Extra inputs are not permitted'), OK, OK]);
  const caller = createCaller({ getClient: () => client, log: silent });
  await caller.call(BASE, { timeoutMs: 1000 });
  assert.deepEqual(caller.dropped(), ['fallbacks']);
  assert.equal(calls[0].path, 'beta');
  assert.deepEqual(calls[0].params.betas, ['server-side-fallback-2026-07-01']);
  assert.equal(calls[0].params.fallbacks, 'default');
  assert.equal(calls[1].path, 'messages');
  assert.equal(calls[1].params.fallbacks, undefined);
  assert.equal(calls[1].params.output_config.format.type, 'json_schema');
  assert.equal(calls[1].params.output_config.effort, 'medium');
  await caller.call(BASE, { timeoutMs: 1000 });
  assert.equal(calls[2].path, 'messages'); // later calls skip the doomed attempt
});

test('a vague 400 that never gets fixed does not switch features off for good', async () => {
  const err = apiError(400, 'Bad request');
  const { client, calls } = fakeClient([err, err, err, err]);
  const caller = createCaller({ getClient: () => client, log: silent });
  await assert.rejects(caller.call(BASE, { timeoutMs: 1000 }), (e) => e instanceof AiError && e.code === 'ai_bad_request');
  assert.deepEqual(caller.dropped(), []);
  assert.equal(calls.length, 4); // original + three reduced retries, then give up
});

test('errors about the content or the account are not retried, so images are not re-uploaded', async () => {
  for (const [status, message] of [[400, 'image exceeds 5 MB maximum'], [404, 'model: claude-x not found'], [400, 'Your credit balance is too low']]) {
    const { client, calls } = fakeClient([apiError(status, message)]);
    const caller = createCaller({ getClient: () => client, log: silent });
    await assert.rejects(caller.call(BASE, { timeoutMs: 1000 }), AiError);
    assert.equal(calls.length, 1, message);
  }
  // ...unless the message also names an optional feature
  assert.equal(featureToDrop(apiError(400, 'output_config.format is not supported for model x'), new Set()), 'format');
});

test('auth errors are reported immediately without retries', async () => {
  const { client, calls } = fakeClient([apiError(401, 'invalid x-api-key')]);
  const caller = createCaller({ getClient: () => client, log: silent });
  await assert.rejects(caller.call(BASE, { timeoutMs: 1000 }), (e) => e.code === 'ai_auth' && e.status === 502);
  assert.equal(calls.length, 1);
});

test('features listed in AI_DISABLE are never sent', async () => {
  const { client, calls } = fakeClient([OK]);
  const caller = createCaller({ getClient: () => client, disabled: ['fallbacks', 'effort'], log: silent });
  await caller.call(BASE, { timeoutMs: 1000 });
  assert.equal(calls[0].path, 'messages');
  assert.equal(calls[0].params.output_config.effort, undefined);
  assert.equal(calls[0].params.output_config.format.type, 'json_schema');
});

test('SDK errors map to user-facing codes, most specific first', () => {
  assert.equal(toAiError(apiError(404, 'model not found')).code, 'ai_model');
  assert.equal(toAiError(apiError(429, 'slow')).code, 'ai_rate_limit');
  assert.equal(toAiError(apiError(500, 'oops')).code, 'ai_upstream');
  assert.equal(toAiError(new Anthropic.APIConnectionTimeoutError()).code, 'ai_timeout');
  assert.equal(toAiError(new Anthropic.APIConnectionError({ message: 'x' })).code, 'ai_connection');
  assert.equal(toAiError(new Anthropic.APIUserAbortError()).code, 'ai_aborted');
  const plain = new TypeError('bug');
  assert.equal(toAiError(plain), plain);
});

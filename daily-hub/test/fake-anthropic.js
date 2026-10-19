import http from 'node:http';
import Anthropic from '@anthropic-ai/sdk';
import { createCaller } from '../src/ai/call.js';

/** A real model caller (real SDK, real error classes) aimed at a fake server. */
export const callerFor = (baseURL) => createCaller({
  getClient: () => new Anthropic({ baseURL, apiKey: 'test-key', maxRetries: 0 }),
  log: () => {},
});

/**
 * Minimal stand-in for the Messages API that streams a canned reply as server-sent events,
 * so the real SDK (streaming parser, error classes, retries) is exercised without a network.
 *   reply:  string | (body) => string   text the model "says"
 *   reject: (body, req) => { status?, message } | null   answer with an API error instead
 */
export async function startFakeAnthropic({ reply = '{}', reject, stopReason = 'end_turn', delayMs = 0 } = {}) {
  const requests = [];
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString() || '{}');
    requests.push({ url: req.url, headers: req.headers, body });
    if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));

    const rejection = reject?.(body, req);
    if (rejection) {
      res.writeHead(rejection.status ?? 400, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message: rejection.message } }));
    }
    const text = typeof reply === 'function' ? reply(body) : reply;
    const mid = Math.ceil(text.length / 2);
    const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify({ type: event, ...data })}\n\n`);
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
    send('message_start', { message: { id: 'msg_fake', type: 'message', role: 'assistant', model: body.model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1200, output_tokens: 1 } } });
    send('content_block_start', { index: 0, content_block: { type: 'text', text: '' } });
    send('content_block_delta', { index: 0, delta: { type: 'text_delta', text: text.slice(0, mid) } });
    send('content_block_delta', { index: 0, delta: { type: 'text_delta', text: text.slice(mid) } });
    send('content_block_stop', { index: 0 });
    send('message_delta', { delta: { stop_reason: stopReason, stop_sequence: null }, usage: { output_tokens: 80 } });
    send('message_stop', {});
    res.end();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    requests,
    close: () => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }),
  };
}

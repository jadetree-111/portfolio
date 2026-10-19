export class ApiError extends Error {
  constructor(status, message, code, data) {
    super(message);
    Object.assign(this, { status, code, data });
  }
}

let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };

async function request(method, url, { json, body, headers, signal } = {}) {
  const init = { method, signal, headers: { ...headers }, credentials: 'same-origin' };
  if (json !== undefined) {
    init.headers['content-type'] = 'application/json';
    init.body = JSON.stringify(json);
  } else if (body !== undefined) {
    init.body = body;
  }
  let res;
  try {
    res = await fetch(url, init);
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ApiError(0, '连不上服务器，请检查网络', 'network');
  }
  if (res.status === 204) return null;
  const isJson = (res.headers.get('content-type') ?? '').includes('json');
  const data = isJson ? await res.json().catch(() => null) : null;
  if (!res.ok) {
    if (res.status === 401 && data?.code === 'unauthorized') onUnauthorized();
    throw new ApiError(res.status, data?.error ?? `请求失败（${res.status}）`, data?.code, data);
  }
  return data;
}

export const api = {
  get: (url, opts) => request('GET', url, opts),
  post: (url, json = {}, opts) => request('POST', url, { ...opts, json }),
  patch: (url, json = {}, opts) => request('PATCH', url, { ...opts, json }),
  del: (url, opts) => request('DELETE', url, opts),
  /** Uploads one image Blob as the raw request body. */
  upload: (blob, opts) => request('POST', '/api/images', { ...opts, body: blob, headers: { 'content-type': blob.type } }),
};

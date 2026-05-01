async function request(method, path, { body, isForm = false } = {}) {
  const opts = { method, credentials: 'same-origin' };
  if (body !== undefined) {
    if (isForm) {
      opts.body = body;
    } else {
      opts.body = JSON.stringify(body);
      opts.headers = { 'Content-Type': 'application/json' };
    }
  }
  const res = await fetch(path, opts);
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = new Error(data?.error || `http_${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export const api = {
  login: (pin) => request('POST', '/api/auth', { body: { pin } }),
  listItems: (params = {}) => {
    const qs = new URLSearchParams();
    if (params.before) qs.set('before', params.before);
    if (params.limit) qs.set('limit', params.limit);
    return request('GET', `/api/items${qs.toString() ? `?${qs}` : ''}`);
  },
  createItem: (content) => request('POST', '/api/items', { body: { content } }),
  uploadFile: (file) => {
    const fd = new FormData();
    fd.append('file', file);
    return request('POST', '/api/items', { body: fd, isForm: true });
  },
  deleteItem: (id) => request('DELETE', `/api/items/${id}`),
};

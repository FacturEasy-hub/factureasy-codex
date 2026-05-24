async function request(method, url, data, opts = {}) {
  const controller = opts.timeout ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), opts.timeout) : null;
  const headers = { ...(opts.headers || {}) };
  const init = { method, headers, signal: controller?.signal };

  if (data !== undefined) {
    if (data instanceof URLSearchParams) {
      init.body = data;
    } else {
      headers['Content-Type'] = headers['Content-Type'] || 'application/json';
      init.body = JSON.stringify(data);
    }
  }

  try {
    const res = await fetch(url, init);
    const text = await res.text();
    const body = text ? JSON.parse(text) : null;
    if (!res.ok) {
      const err = new Error(`HTTP ${res.status}`);
      err.response = { status: res.status, data: body };
      throw err;
    }
    return { data: body, status: res.status };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

module.exports = {
  get(url, opts) {
    return request('GET', url, undefined, opts);
  },
  post(url, data, opts) {
    return request('POST', url, data, opts);
  },
};

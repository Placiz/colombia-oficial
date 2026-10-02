const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';

export async function fetchText(url, { timeout = 20000, headers = {} } = {}) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'es-CO,es;q=0.9', ...headers },
    redirect: 'follow',
    signal: AbortSignal.timeout(timeout),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} en ${url}`);
  return { text: await res.text(), url: res.url, contentType: res.headers.get('content-type') || '' };
}

export async function fetchJson(url, opts = {}) {
  const { text } = await fetchText(url, opts);
  return JSON.parse(text);
}

// Ejecuta tareas async con un límite de concurrencia.
export async function pool(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return out;
}

const TITLE_RE = /<title[^>]*>([^<]*)<\/title>/i;

const ENTITIES = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&apos;': "'",
};

function decodeEntities(s) {
  return s.replace(/&(amp|lt|gt|quot|#39|apos);/g, (m) => ENTITIES[m] ?? m);
}

export async function fetchTitle(url, { timeoutMs = 3000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'user-agent': 'LocalDrop/0.1' },
    });
    if (!res.ok) return null;
    const html = await res.text();
    const match = html.match(TITLE_RE);
    if (!match) return null;
    return decodeEntities(match[1].trim()) || null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

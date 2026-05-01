const URL_RE = /^https?:\/\/\S+$/;

export function detectType(input) {
  const trimmed = (input ?? '').trim();
  if (URL_RE.test(trimmed)) return 'link';
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed !== null && typeof parsed === 'object') return 'json';
  } catch { /* fall through */ }
  return 'text';
}

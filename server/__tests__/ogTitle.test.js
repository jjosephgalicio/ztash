import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchTitle } from '../ogTitle.js';

beforeEach(() => { vi.restoreAllMocks(); });
afterEach(() => { vi.restoreAllMocks(); });

describe('fetchTitle', () => {
  it('extracts <title>', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: async () => '<html><head><title>Hello World</title></head></html>',
    }));
    expect(await fetchTitle('https://x.test')).toBe('Hello World');
  });

  it('decodes basic html entities', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: async () => '<title>A &amp; B</title>',
    }));
    expect(await fetchTitle('https://x.test')).toBe('A & B');
  });

  it('returns null when no title', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: async () => '<html><body>no title</body></html>',
    }));
    expect(await fetchTitle('https://x.test')).toBeNull();
  });

  it('returns null on fetch failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('boom')));
    expect(await fetchTitle('https://x.test')).toBeNull();
  });

  it('returns null on non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    expect(await fetchTitle('https://x.test')).toBeNull();
  });
});

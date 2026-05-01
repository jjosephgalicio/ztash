import { describe, it, expect } from 'vitest';
import { detectType } from '../typeDetect.js';

describe('detectType', () => {
  it('detects http URLs as link', () => {
    expect(detectType('http://example.com')).toBe('link');
    expect(detectType('https://example.com/path?q=1')).toBe('link');
  });

  it('does not match URLs with whitespace', () => {
    expect(detectType('https://a.com b')).toBe('text');
  });

  it('detects JSON objects as json', () => {
    expect(detectType('{"a":1}')).toBe('json');
    expect(detectType('  {"a":1}  ')).toBe('json');
  });

  it('detects JSON arrays as json', () => {
    expect(detectType('[1,2,3]')).toBe('json');
  });

  it('does not classify bare numbers/strings/null as json', () => {
    expect(detectType('42')).toBe('text');
    expect(detectType('"hello"')).toBe('text');
    expect(detectType('null')).toBe('text');
  });

  it('falls back to text', () => {
    expect(detectType('just some words')).toBe('text');
    expect(detectType('')).toBe('text');
  });
});

import { describe, it, expect } from 'vitest';
import { pickLanAddress } from '../lan.js';

describe('pickLanAddress', () => {
  it('returns first non-internal IPv4 address', () => {
    const fakeIfaces = {
      lo: [{ address: '127.0.0.1', family: 'IPv4', internal: true }],
      eth0: [{ address: '192.168.1.10', family: 'IPv4', internal: false }],
    };
    expect(pickLanAddress(fakeIfaces)).toBe('192.168.1.10');
  });

  it('skips internal interfaces', () => {
    const fakeIfaces = {
      lo: [{ address: '127.0.0.1', family: 'IPv4', internal: true }],
    };
    expect(pickLanAddress(fakeIfaces)).toBe('127.0.0.1');
  });

  it('skips IPv6', () => {
    const fakeIfaces = {
      eth0: [
        { address: 'fe80::1', family: 'IPv6', internal: false },
        { address: '10.0.0.5', family: 'IPv4', internal: false },
      ],
    };
    expect(pickLanAddress(fakeIfaces)).toBe('10.0.0.5');
  });
});

import { describe, it, expect } from 'vitest';
import { pickLanAddress } from '../lan.js';

describe('pickLanAddress', () => {
  it('returns the only non-internal IPv4 address', () => {
    const ifaces = {
      lo: [{ address: '127.0.0.1', family: 'IPv4', internal: true }],
      eth0: [{ address: '192.168.1.10', family: 'IPv4', internal: false }],
    };
    expect(pickLanAddress(ifaces)).toBe('192.168.1.10');
  });

  it('falls back to 127.0.0.1 when only internal addresses are present', () => {
    const ifaces = {
      lo: [{ address: '127.0.0.1', family: 'IPv4', internal: true }],
    };
    expect(pickLanAddress(ifaces)).toBe('127.0.0.1');
  });

  it('skips IPv6', () => {
    const ifaces = {
      eth0: [
        { address: 'fe80::1', family: 'IPv6', internal: false },
        { address: '10.0.0.5', family: 'IPv4', internal: false },
      ],
    };
    expect(pickLanAddress(ifaces)).toBe('10.0.0.5');
  });

  it('prefers 192.168/16 (home routers) over 172.16/12 (Docker / Hyper-V)', () => {
    const ifaces = {
      'vEthernet (WSL)': [{ address: '172.21.16.1', family: 'IPv4', internal: false }],
      'Wi-Fi': [{ address: '192.168.1.42', family: 'IPv4', internal: false }],
    };
    expect(pickLanAddress(ifaces)).toBe('192.168.1.42');
  });

  it('skips Hyper-V / vEthernet adapters even when listed first', () => {
    const ifaces = {
      'vEthernet (Default Switch)': [{ address: '172.20.16.1', family: 'IPv4', internal: false }],
      'vEthernet (WSL)': [{ address: '172.21.0.1', family: 'IPv4', internal: false }],
      Ethernet: [{ address: '192.168.0.10', family: 'IPv4', internal: false }],
    };
    expect(pickLanAddress(ifaces)).toBe('192.168.0.10');
  });

  it('skips VirtualBox host-only adapters', () => {
    const ifaces = {
      'VirtualBox Host-Only Network': [{ address: '192.168.56.1', family: 'IPv4', internal: false }],
      'Wi-Fi': [{ address: '192.168.1.5', family: 'IPv4', internal: false }],
    };
    // Both are 192.168, so the virtual-name penalty is what tips the choice.
    expect(pickLanAddress(ifaces)).toBe('192.168.1.5');
  });

  it('prefers 192.168 over 10.x when both are present', () => {
    const ifaces = {
      tun0: [{ address: '10.8.0.2', family: 'IPv4', internal: false }],
      en0: [{ address: '192.168.1.20', family: 'IPv4', internal: false }],
    };
    expect(pickLanAddress(ifaces)).toBe('192.168.1.20');
  });

  it('falls back to a 172.x address when nothing better is available', () => {
    // User runs only Docker — the Docker bridge is the only LAN address.
    // Better to print it than to print 127.0.0.1.
    const ifaces = {
      docker0: [{ address: '172.17.0.1', family: 'IPv4', internal: false }],
    };
    expect(pickLanAddress(ifaces)).toBe('172.17.0.1');
  });
});

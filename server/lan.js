import os from 'node:os';

export function pickLanAddress(ifaces = os.networkInterfaces()) {
  for (const list of Object.values(ifaces)) {
    for (const entry of list ?? []) {
      if (entry.family === 'IPv4' && !entry.internal) return entry.address;
    }
  }
  return '127.0.0.1';
}

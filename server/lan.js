import os from 'node:os';

// Score a candidate higher when it looks like a real home network adapter.
// Lower scores for virtual adapters (Hyper-V, WSL, Docker, VirtualBox, VPN)
// that are routinely listed first by the OS but unreachable from a phone on
// the user's actual WiFi.
const VIRTUAL_NAME_RE = /v(ethernet|m|box)|virtual|docker|wsl|hyper-?v|bluetooth|vpn|tun|tap|loop|utun|tailscale|zerotier/i;
const PREFERRED_NAME_RE = /^(wi-?fi|wlan|en|eth|wired|wireless)/i;

function score({ name, address }) {
  let s = 0;
  // Address-range preference: home routers use 192.168/16 first, 10/8 next,
  // 172.16/12 is mostly Docker/WSL on consumer machines so it goes last.
  if (/^192\.168\./.test(address)) s += 100;
  else if (/^10\./.test(address)) s += 50;
  else if (/^172\.(1[6-9]|2\d|3[01])\./.test(address)) s += 20;
  // Interface-name signals.
  if (VIRTUAL_NAME_RE.test(name)) s -= 60;
  if (PREFERRED_NAME_RE.test(name)) s += 10;
  return s;
}

export function pickLanAddress(ifaces = os.networkInterfaces()) {
  const candidates = [];
  for (const [name, list] of Object.entries(ifaces)) {
    for (const entry of list ?? []) {
      if (entry.family === 'IPv4' && !entry.internal) {
        candidates.push({ name, address: entry.address });
      }
    }
  }
  if (candidates.length === 0) return '127.0.0.1';
  candidates.sort((a, b) => score(b) - score(a));
  return candidates[0].address;
}

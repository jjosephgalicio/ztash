import { randomBytes, timingSafeEqual } from 'node:crypto';

const SESSION_COOKIE = 'ld_session';
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_FAILS = 5;

export function createAuth({ pin, secureCookie = false }) {
  const sessions = new Set();
  const failures = new Map(); // ip -> { count, firstFailMs }

  function constantEq(a, b) {
    const ab = Buffer.from(a);
    const bb = Buffer.from(b);
    if (ab.length !== bb.length) return false;
    return timingSafeEqual(ab, bb);
  }

  function isLockedOut(ip) {
    const entry = failures.get(ip);
    if (!entry) return false;
    if (Date.now() - entry.firstFailMs > RATE_WINDOW_MS) {
      failures.delete(ip);
      return false;
    }
    return entry.count >= RATE_MAX_FAILS;
  }

  function recordFailure(ip) {
    const entry = failures.get(ip);
    if (!entry || Date.now() - entry.firstFailMs > RATE_WINDOW_MS) {
      failures.set(ip, { count: 1, firstFailMs: Date.now() });
    } else {
      entry.count += 1;
    }
  }

  return {
    loginHandler(req, res) {
      const ip = req.ip || 'unknown';
      if (isLockedOut(ip)) {
        return res.status(429).json({ error: 'too_many_attempts' });
      }
      const submitted = String(req.body?.pin ?? '');
      if (!constantEq(submitted, pin)) {
        recordFailure(ip);
        return res.status(401).json({ error: 'invalid_pin' });
      }
      const token = randomBytes(32).toString('hex');
      sessions.add(token);
      res.cookie(SESSION_COOKIE, token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: secureCookie,
        maxAge: 1000 * 60 * 60 * 24 * 365,
      });
      failures.delete(ip);
      return res.json({ ok: true });
    },

    requireAuth(req, res, next) {
      const token = req.cookies?.[SESSION_COOKIE];
      if (!token || !sessions.has(token)) {
        return res.status(401).json({ error: 'unauthorized' });
      }
      next();
    },
  };
}

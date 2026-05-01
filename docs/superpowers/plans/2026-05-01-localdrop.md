# LocalDrop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a self-hosted PWA that lets a laptop and a phone exchange images, text, links, and JSON over the same WiFi network in real time.

**Architecture:** A single Node.js + Express server on the laptop persists items in SQLite and pushes updates over Server-Sent Events. A PWA client (Vite + vanilla JS) is served from the same origin, gated by a PIN cookie.

**Tech Stack:** Node 22.5+, Express, `node:sqlite` (Node stdlib, no native build), multer, vitest (server tests), supertest (integration tests), Vite (client build), vanilla JS, plain CSS.

**Spec:** [`docs/superpowers/specs/2026-05-01-localdrop-design.md`](../specs/2026-05-01-localdrop-design.md)

**Test conventions:** Server modules are tested with vitest. Tests live in `server/__tests__/` next to the modules. Integration tests live in `server/__tests__/integration/`. The client has no unit tests in v1 — verify manually using the checklist in Task 24.

**Commit style:** Use Conventional Commits (`feat:`, `fix:`, `test:`, `chore:`, `docs:`).

---

## Phase 1 — Project scaffold

### Task 1: Initialize project, dependencies, and ignore files

**Files:**
- Create: `package.json`, `.gitignore`, `.env.example`, `vite.config.js`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "localdrop",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev:server": "node --watch server/index.js",
    "dev:client": "vite",
    "build": "vite build",
    "start": "node server/index.js",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "cookie-parser": "^1.4.7",
    "dotenv": "^16.4.5",
    "express": "^4.21.0",
    "multer": "^1.4.5-lts.1"
  },
  "devDependencies": {
    "supertest": "^7.0.0",
    "vite": "^5.4.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Create `.gitignore`**

```
node_modules/
dist/
data/
uploads/
.env
*.log
.DS_Store
```

- [ ] **Step 3: Create `.env.example`**

```
PIN=123456
PORT=4123
MAX_UPLOAD_MB=50
DATA_DIR=./data
```

- [ ] **Step 4: Create `vite.config.js`**

```js
import { defineConfig } from 'vite';

export default defineConfig({
  root: 'client',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:4123',
    },
  },
});
```

- [ ] **Step 5: Install dependencies**

Run: `npm install`
Expected: dependencies install, `node_modules/` created, no errors.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json .gitignore .env.example vite.config.js
git commit -m "chore: scaffold project with deps and vite config"
```

---

## Phase 2 — Server building blocks (pure functions, easy to TDD)

### Task 2: Type detection utility

The server needs to classify a text submission as `link`, `json`, or `text`.

**Files:**
- Create: `server/typeDetect.js`
- Create: `server/__tests__/typeDetect.test.js`

- [ ] **Step 1: Write failing tests**

`server/__tests__/typeDetect.test.js`:
```js
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
```

- [ ] **Step 2: Run tests — verify they fail**

Run: `npm test -- typeDetect`
Expected: FAIL with "Cannot find module '../typeDetect.js'".

- [ ] **Step 3: Implement `server/typeDetect.js`**

```js
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
```

- [ ] **Step 4: Run tests — verify they pass**

Run: `npm test -- typeDetect`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add server/typeDetect.js server/__tests__/typeDetect.test.js
git commit -m "feat: add type detection for text submissions"
```

---

### Task 3: LAN IP discovery

So we can print `http://<lan-ip>:4123` at startup.

**Files:**
- Create: `server/lan.js`
- Create: `server/__tests__/lan.test.js`

- [ ] **Step 1: Write failing tests**

`server/__tests__/lan.test.js`:
```js
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
```

- [ ] **Step 2: Run tests — verify they fail**

Run: `npm test -- lan`
Expected: FAIL.

- [ ] **Step 3: Implement `server/lan.js`**

```js
import os from 'node:os';

export function pickLanAddress(ifaces = os.networkInterfaces()) {
  for (const list of Object.values(ifaces)) {
    for (const entry of list ?? []) {
      if (entry.family === 'IPv4' && !entry.internal) return entry.address;
    }
  }
  return '127.0.0.1';
}
```

- [ ] **Step 4: Run tests — verify they pass**

Run: `npm test -- lan`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add server/lan.js server/__tests__/lan.test.js
git commit -m "feat: add LAN IPv4 address discovery"
```

---

### Task 4: SQLite database module

Schema, prepared statements, and CRUD helpers per spec §5.

**Files:**
- Create: `server/db.js`
- Create: `server/__tests__/db.test.js`

- [ ] **Step 1: Write failing tests**

`server/__tests__/db.test.js`:
```js
import { describe, it, expect, beforeEach } from 'vitest';
import { createDb } from '../db.js';

let db;
beforeEach(() => {
  db = createDb(':memory:');
});

describe('items repository', () => {
  it('inserts and retrieves an item', () => {
    const item = db.items.insert({
      type: 'text',
      content: 'hello',
      mime: null,
      size: 5,
      original_filename: null,
      link_title: null,
    });
    expect(item.id).toBeTruthy();
    expect(item.created_at).toBeGreaterThan(0);
    expect(db.items.findById(item.id)).toMatchObject({ content: 'hello' });
  });

  it('lists items newest first with hasMore flag', () => {
    db.items.insert({ type: 'text', content: 'a', size: 1 });
    db.items.insert({ type: 'text', content: 'b', size: 1 });
    db.items.insert({ type: 'text', content: 'c', size: 1 });
    const { items, hasMore } = db.items.list({ limit: 2 });
    expect(items.map(i => i.content)).toEqual(['c', 'b']);
    expect(hasMore).toBe(true);
  });

  it('paginates with before cursor (older items only)', () => {
    db.items.insert({ type: 'text', content: 'a', size: 1 });
    const second = db.items.insert({ type: 'text', content: 'b', size: 1 });
    const { items } = db.items.list({ before: second.created_at, limit: 10 });
    expect(items.map(i => i.content)).toEqual(['a']);
  });

  it('deletes an item', () => {
    const item = db.items.insert({ type: 'text', content: 'x', size: 1 });
    expect(db.items.remove(item.id)).toBe(true);
    expect(db.items.findById(item.id)).toBeUndefined();
    expect(db.items.remove('nonexistent')).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

Run: `npm test -- db`
Expected: FAIL.

- [ ] **Step 3: Implement `server/db.js`** (uses `node:sqlite` — built-in to Node 22.5+, no native build required)

```js
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';

// node:sqlite via createRequire — Vite/Vitest's resolver doesn't recognize
// this stdlib module yet (it's newer than Vite's built-in node module list)
// and tries to resolve a "sqlite" package, which doesn't exist. createRequire
// bypasses Vite and uses Node's native resolution.
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS items (
  id                TEXT PRIMARY KEY,
  type              TEXT NOT NULL,
  content           TEXT NOT NULL,
  mime              TEXT,
  size              INTEGER,
  original_filename TEXT,
  link_title        TEXT,
  created_at        INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_items_created_at ON items(created_at DESC);
`;

export function createDb(path) {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec(SCHEMA);

  const stmts = {
    insert: db.prepare(`
      INSERT INTO items (id, type, content, mime, size, original_filename, link_title, created_at)
      VALUES (@id, @type, @content, @mime, @size, @original_filename, @link_title, @created_at)
    `),
    findById: db.prepare(`SELECT * FROM items WHERE id = ?`),
    listFirst: db.prepare(`
      SELECT * FROM items ORDER BY created_at DESC LIMIT ?
    `),
    listBefore: db.prepare(`
      SELECT * FROM items WHERE created_at < ? ORDER BY created_at DESC LIMIT ?
    `),
    remove: db.prepare(`DELETE FROM items WHERE id = ?`),
    updateLinkTitle: db.prepare(`UPDATE items SET link_title = ? WHERE id = ?`),
  };

  return {
    raw: db,
    items: {
      insert(input) {
        const row = {
          id: randomUUID(),
          type: input.type,
          content: input.content,
          mime: input.mime ?? null,
          size: input.size ?? null,
          original_filename: input.original_filename ?? null,
          link_title: input.link_title ?? null,
          created_at: Date.now(),
        };
        stmts.insert.run(row);
        return row;
      },
      findById(id) {
        return stmts.findById.get(id);
      },
      list({ before, limit = 50 } = {}) {
        const requested = Math.min(Math.max(1, limit), 200);
        const fetchLimit = requested + 1;
        const rows = before == null
          ? stmts.listFirst.all(fetchLimit)
          : stmts.listBefore.all(before, fetchLimit);
        const hasMore = rows.length > requested;
        return { items: hasMore ? rows.slice(0, requested) : rows, hasMore };
      },
      remove(id) {
        return stmts.remove.run(id).changes > 0;
      },
      updateLinkTitle(id, title) {
        stmts.updateLinkTitle.run(title, id);
      },
    },
  };
}
```

**Note on `node:sqlite`:** This is a Node.js stdlib module (stable since Node 22.5). The API is intentionally close to better-sqlite3 — synchronous, prepare/run/get/all — so the rest of the plan reads the same. The one caller-visible difference is `db.exec('PRAGMA …')` instead of `db.pragma(…)`.

- [ ] **Step 4: Run tests — verify they pass**

Run: `npm test -- db`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add server/db.js server/__tests__/db.test.js
git commit -m "feat: add SQLite items repository"
```

---

## Phase 3 — Server API

### Task 5: Express app skeleton with PIN auth

PIN check, session cookie, rate limit.

**Files:**
- Create: `server/auth.js`
- Create: `server/app.js`
- Create: `server/__tests__/auth.test.js`

- [ ] **Step 1: Write failing tests**

`server/__tests__/auth.test.js`:
```js
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { createDb } from '../db.js';

let app;
beforeEach(() => {
  const db = createDb(':memory:');
  app = createApp({ db, pin: '123456', uploadsDir: '/tmp/ld-test', maxUploadBytes: 1024 });
});

describe('auth', () => {
  it('rejects wrong PIN', async () => {
    const res = await request(app).post('/api/auth').send({ pin: '000000' });
    expect(res.status).toBe(401);
  });

  it('accepts correct PIN and sets session cookie', async () => {
    const res = await request(app).post('/api/auth').send({ pin: '123456' });
    expect(res.status).toBe(200);
    expect(res.headers['set-cookie']?.[0]).toMatch(/ld_session=/);
    expect(res.headers['set-cookie']?.[0]).toMatch(/HttpOnly/);
  });

  it('blocks unauthenticated requests to /api/items', async () => {
    const res = await request(app).get('/api/items');
    expect(res.status).toBe(401);
  });

  it('allows authenticated requests', async () => {
    const auth = await request(app).post('/api/auth').send({ pin: '123456' });
    const cookie = auth.headers['set-cookie'][0];
    const res = await request(app).get('/api/items').set('Cookie', cookie);
    expect(res.status).toBe(200);
  });

  it('rate-limits failed attempts', async () => {
    for (let i = 0; i < 5; i++) {
      await request(app).post('/api/auth').send({ pin: 'bad' });
    }
    const res = await request(app).post('/api/auth').send({ pin: 'bad' });
    expect(res.status).toBe(429);
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

Run: `npm test -- auth`
Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Implement `server/auth.js`**

```js
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
```

- [ ] **Step 4: Implement `server/app.js`**

```js
import express from 'express';
import cookieParser from 'cookie-parser';
import { createAuth } from './auth.js';

export function createApp({ db, pin, uploadsDir, maxUploadBytes }) {
  const app = express();
  app.set('trust proxy', true);
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  const auth = createAuth({ pin });

  app.post('/api/auth', auth.loginHandler);

  // Items list — placeholder; full handler added in Task 6.
  app.get('/api/items', auth.requireAuth, (_req, res) => {
    res.json({ items: [], hasMore: false });
  });

  return app;
}
```

- [ ] **Step 5: Run tests — verify they pass**

Run: `npm test -- auth`
Expected: PASS, 5 tests.

- [ ] **Step 6: Commit**

```bash
git add server/auth.js server/app.js server/__tests__/auth.test.js
git commit -m "feat: add PIN auth with session cookies and rate limiting"
```

---

### Task 6: Items create / list / delete API

Implement non-upload paths (text/link/json submitted via JSON body). File uploads come in Task 7. OG title fetch comes in Task 8.

**Files:**
- Create: `server/items.js`
- Modify: `server/app.js`
- Create: `server/__tests__/items.test.js`

- [ ] **Step 1: Write failing tests**

`server/__tests__/items.test.js`:
```js
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { createDb } from '../db.js';

async function authed(app) {
  const auth = await request(app).post('/api/auth').send({ pin: '123456' });
  return auth.headers['set-cookie'][0];
}

let app;
beforeEach(() => {
  const db = createDb(':memory:');
  app = createApp({ db, pin: '123456', uploadsDir: '/tmp/ld-test', maxUploadBytes: 1024 });
});

describe('items API', () => {
  it('creates a text item', async () => {
    const cookie = await authed(app);
    const res = await request(app).post('/api/items').set('Cookie', cookie)
      .send({ content: 'hello world' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ type: 'text', content: 'hello world', size: 11 });
    expect(res.body.id).toBeTruthy();
  });

  it('creates a link item', async () => {
    const cookie = await authed(app);
    const res = await request(app).post('/api/items').set('Cookie', cookie)
      .send({ content: 'https://example.com' });
    expect(res.body.type).toBe('link');
  });

  it('creates a json item', async () => {
    const cookie = await authed(app);
    const res = await request(app).post('/api/items').set('Cookie', cookie)
      .send({ content: '{"a":1}' });
    expect(res.body.type).toBe('json');
  });

  it('rejects empty content', async () => {
    const cookie = await authed(app);
    const res = await request(app).post('/api/items').set('Cookie', cookie)
      .send({ content: '' });
    expect(res.status).toBe(400);
  });

  it('lists items newest first', async () => {
    const cookie = await authed(app);
    await request(app).post('/api/items').set('Cookie', cookie).send({ content: 'a' });
    await request(app).post('/api/items').set('Cookie', cookie).send({ content: 'b' });
    const res = await request(app).get('/api/items').set('Cookie', cookie);
    expect(res.body.items.map(i => i.content)).toEqual(['b', 'a']);
    expect(res.body.hasMore).toBe(false);
  });

  it('deletes an item', async () => {
    const cookie = await authed(app);
    const created = await request(app).post('/api/items').set('Cookie', cookie)
      .send({ content: 'gone' });
    const del = await request(app).delete(`/api/items/${created.body.id}`).set('Cookie', cookie);
    expect(del.status).toBe(204);
    const res = await request(app).get('/api/items').set('Cookie', cookie);
    expect(res.body.items).toHaveLength(0);
  });

  it('returns 404 deleting unknown id', async () => {
    const cookie = await authed(app);
    const res = await request(app).delete('/api/items/missing').set('Cookie', cookie);
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

Run: `npm test -- items`
Expected: FAIL — POST returns 404 (route not yet registered).

- [ ] **Step 3: Implement `server/items.js`**

```js
import { detectType } from './typeDetect.js';

export function createItemsRouter({ db, broadcast = () => {} }) {
  return {
    create(req, res) {
      const content = String(req.body?.content ?? '').trim();
      if (!content) return res.status(400).json({ error: 'empty_content' });
      const type = detectType(content);
      const item = db.items.insert({
        type,
        content,
        size: Buffer.byteLength(content, 'utf8'),
      });
      broadcast('item:created', item);
      res.status(201).json(item);
    },

    list(req, res) {
      const before = req.query.before ? Number(req.query.before) : undefined;
      const limit = req.query.limit ? Number(req.query.limit) : 50;
      res.json(db.items.list({ before, limit }));
    },

    remove(req, res) {
      const ok = db.items.remove(req.params.id);
      if (!ok) return res.status(404).json({ error: 'not_found' });
      broadcast('item:deleted', { id: req.params.id });
      res.status(204).end();
    },
  };
}
```

- [ ] **Step 4: Modify `server/app.js` — wire up the items router**

Replace the placeholder list handler:
```js
import express from 'express';
import cookieParser from 'cookie-parser';
import { createAuth } from './auth.js';
import { createItemsRouter } from './items.js';

export function createApp({ db, pin, uploadsDir, maxUploadBytes, broadcast }) {
  const app = express();
  app.set('trust proxy', true);
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  const auth = createAuth({ pin });
  const items = createItemsRouter({ db, broadcast });

  app.post('/api/auth', auth.loginHandler);
  app.get('/api/items', auth.requireAuth, items.list);
  app.post('/api/items', auth.requireAuth, items.create);
  app.delete('/api/items/:id', auth.requireAuth, items.remove);

  return app;
}
```

- [ ] **Step 5: Run tests — verify they pass**

Run: `npm test -- items`
Expected: PASS, 7 tests.

- [ ] **Step 6: Commit**

```bash
git add server/items.js server/app.js server/__tests__/items.test.js
git commit -m "feat: add items create/list/delete API"
```

---

### Task 7: File upload (image-only)

Multer-backed file upload, size cap, image-only validation.

**Files:**
- Create: `server/uploads.js`
- Modify: `server/items.js` (add upload handler)
- Modify: `server/app.js` (mount upload route + serve uploads)
- Create: `server/__tests__/uploads.test.js`

- [ ] **Step 1: Write failing tests**

`server/__tests__/uploads.test.js`:
```js
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createApp } from '../app.js';
import { createDb } from '../db.js';

let app, uploadsDir;

beforeEach(() => {
  uploadsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ld-uploads-'));
  const db = createDb(':memory:');
  app = createApp({ db, pin: '123456', uploadsDir, maxUploadBytes: 1024 * 10 });
});

afterEach(() => {
  fs.rmSync(uploadsDir, { recursive: true, force: true });
});

async function authed() {
  const auth = await request(app).post('/api/auth').send({ pin: '123456' });
  return auth.headers['set-cookie'][0];
}

describe('uploads', () => {
  it('accepts an image upload', async () => {
    const cookie = await authed();
    // 1x1 PNG
    const png = Buffer.from(
      '89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C489' +
      '0000000A49444154789C63000100000500010DCAE9510000000049454E44AE426082',
      'hex'
    );
    const res = await request(app).post('/api/items').set('Cookie', cookie)
      .attach('file', png, { filename: 'pixel.png', contentType: 'image/png' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ type: 'image', mime: 'image/png', original_filename: 'pixel.png' });
    expect(res.body.content).toMatch(/^[a-f0-9-]+\.png$/);
    expect(fs.existsSync(path.join(uploadsDir, res.body.content))).toBe(true);
  });

  it('rejects non-image files', async () => {
    const cookie = await authed();
    const res = await request(app).post('/api/items').set('Cookie', cookie)
      .attach('file', Buffer.from('hello'), { filename: 'a.txt', contentType: 'text/plain' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('only_images');
  });

  it('rejects files over size limit', async () => {
    const cookie = await authed();
    const big = Buffer.alloc(1024 * 11, 0); // > maxUploadBytes
    const res = await request(app).post('/api/items').set('Cookie', cookie)
      .attach('file', big, { filename: 'big.png', contentType: 'image/png' });
    expect(res.status).toBe(413);
  });

  it('serves uploaded files via /api/uploads', async () => {
    const cookie = await authed();
    const png = Buffer.from(
      '89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C489' +
      '0000000A49444154789C63000100000500010DCAE9510000000049454E44AE426082',
      'hex'
    );
    const upload = await request(app).post('/api/items').set('Cookie', cookie)
      .attach('file', png, { filename: 'pixel.png', contentType: 'image/png' });
    const res = await request(app).get(`/api/uploads/${upload.body.content}`).set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/image\/png/);
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

Run: `npm test -- uploads`
Expected: FAIL.

- [ ] **Step 3: Implement `server/uploads.js`**

```js
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';

const SAFE_EXT_RE = /^\.[a-z0-9]+$/i;

export function createUploader({ uploadsDir, maxBytes }) {
  fs.mkdirSync(uploadsDir, { recursive: true });

  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsDir),
    filename: (_req, file, cb) => {
      const rawExt = path.extname(file.originalname).toLowerCase();
      const ext = SAFE_EXT_RE.test(rawExt) ? rawExt : '.bin';
      cb(null, `${randomUUID()}${ext}`);
    },
  });

  return multer({
    storage,
    limits: { fileSize: maxBytes },
    fileFilter: (_req, file, cb) => {
      if (!file.mimetype.startsWith('image/')) {
        cb(Object.assign(new Error('only_images'), { code: 'ONLY_IMAGES' }));
        return;
      }
      cb(null, true);
    },
  });
}
```

- [ ] **Step 4: Modify `server/items.js` — add upload handler**

Add to the object returned by `createItemsRouter`:
```js
uploadHandler(req, res) {
  if (!req.file) return res.status(400).json({ error: 'no_file' });
  const item = db.items.insert({
    type: 'image',
    content: req.file.filename,
    mime: req.file.mimetype,
    size: req.file.size,
    original_filename: req.file.originalname,
  });
  broadcast('item:created', item);
  res.status(201).json(item);
},
```

Also update `create` to delegate to `uploadHandler` when a file is present — actually, keep them as separate routes (cleaner). The `create` handler stays as-is.

- [ ] **Step 5: Modify `server/app.js` — content-type-based dispatch + uploads serving**

Replace the `POST /api/items` registration and add static serving:
```js
import express from 'express';
import cookieParser from 'cookie-parser';
import { createAuth } from './auth.js';
import { createItemsRouter } from './items.js';
import { createUploader } from './uploads.js';

export function createApp({ db, pin, uploadsDir, maxUploadBytes, broadcast }) {
  const app = express();
  app.set('trust proxy', true);
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  const auth = createAuth({ pin });
  const items = createItemsRouter({ db, broadcast });
  const uploader = createUploader({ uploadsDir, maxBytes: maxUploadBytes });

  app.post('/api/auth', auth.loginHandler);
  app.get('/api/items', auth.requireAuth, items.list);
  app.delete('/api/items/:id', auth.requireAuth, items.remove);

  // POST /api/items — multipart goes to uploadHandler, JSON goes to create.
  app.post('/api/items', auth.requireAuth, (req, res, next) => {
    if ((req.headers['content-type'] || '').startsWith('multipart/')) {
      uploader.single('file')(req, res, (err) => {
        if (err) {
          if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(413).json({ error: 'file_too_large', maxBytes: maxUploadBytes });
          }
          if (err.code === 'ONLY_IMAGES') {
            return res.status(400).json({ error: 'only_images' });
          }
          return res.status(500).json({ error: 'upload_failed' });
        }
        items.uploadHandler(req, res);
      });
    } else {
      items.create(req, res, next);
    }
  });

  app.get('/api/uploads/:filename', auth.requireAuth, (req, res) => {
    const safe = req.params.filename.replace(/[^a-zA-Z0-9.-]/g, '');
    res.sendFile(safe, { root: uploadsDir }, (err) => {
      if (err) res.status(404).json({ error: 'not_found' });
    });
  });

  return app;
}
```

- [ ] **Step 6: Run tests — verify they pass**

Run: `npm test`
Expected: all suites PASS.

- [ ] **Step 7: Commit**

```bash
git add server/uploads.js server/items.js server/app.js server/__tests__/uploads.test.js
git commit -m "feat: add image-only file upload with size limit"
```

---

### Task 8: OG title fetch for links

Best-effort fetch of `<title>` tag with 3-second timeout. Failure leaves `link_title` null.

**Files:**
- Create: `server/ogTitle.js`
- Modify: `server/items.js` (call after detecting link type)
- Create: `server/__tests__/ogTitle.test.js`

- [ ] **Step 1: Write failing tests**

`server/__tests__/ogTitle.test.js`:
```js
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
```

- [ ] **Step 2: Run tests — verify they fail**

Run: `npm test -- ogTitle`
Expected: FAIL.

- [ ] **Step 3: Implement `server/ogTitle.js`**

```js
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
```

- [ ] **Step 4: Modify `server/items.js` — fetch title for links (fire-and-forget)**

Update `create` to kick off OG fetch and emit a follow-up update if successful. Replace `create`:
```js
async create(req, res) {
  const content = String(req.body?.content ?? '').trim();
  if (!content) return res.status(400).json({ error: 'empty_content' });
  const type = detectType(content);
  const item = db.items.insert({
    type,
    content,
    size: Buffer.byteLength(content, 'utf8'),
  });
  broadcast('item:created', item);
  res.status(201).json(item);

  if (type === 'link') {
    fetchTitleAsync(content).then((title) => {
      if (!title) return;
      db.items.updateLinkTitle(item.id, title);
      broadcast('item:updated', { ...item, link_title: title });
    });
  }
},
```

Add to top of `server/items.js`:
```js
import { detectType } from './typeDetect.js';
import { fetchTitle as fetchTitleAsync } from './ogTitle.js';
```

(Note: this introduces a new SSE event `item:updated`. Document it in §6 of the spec — added in Task 24's docs pass.)

- [ ] **Step 5: Add a fetch stub to the items test so the new fire-and-forget OG fetch in `create` doesn't hit the real network**

Insert at the top of `server/__tests__/items.test.js` (after existing imports):
```js
import { vi, beforeAll, afterAll } from 'vitest';
beforeAll(() => { vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false })); });
afterAll(() => { vi.unstubAllGlobals(); });
```

- [ ] **Step 6: Run tests — verify they pass**

Run: `npm test`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add server/ogTitle.js server/items.js server/__tests__/
git commit -m "feat: fetch OG title for link items"
```

---

### Task 9: SSE broadcast hub

In-memory set of connected response objects, broadcast helper, heartbeat.

**Files:**
- Create: `server/sse.js`
- Modify: `server/app.js`
- Create: `server/__tests__/sse.test.js`

- [ ] **Step 1: Write failing tests**

`server/__tests__/sse.test.js`:
```js
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import http from 'node:http';
import request from 'supertest';
import { createApp } from '../app.js';
import { createDb } from '../db.js';
import { createSseHub } from '../sse.js';

describe('SSE hub', () => {
  it('broadcasts events to connected clients', async () => {
    const hub = createSseHub();
    const db = createDb(':memory:');
    const app = createApp({
      db, pin: '123456', uploadsDir: '/tmp/ld-test', maxUploadBytes: 1024,
      broadcast: hub.broadcast, sseHandler: hub.handler,
    });
    const server = http.createServer(app).listen(0);
    const port = server.address().port;
    const auth = await request(app).post('/api/auth').send({ pin: '123456' });
    const cookie = auth.headers['set-cookie'][0];

    const events = [];
    const events$ = new Promise((resolve) => {
      const req = http.get(`http://127.0.0.1:${port}/api/events`, { headers: { Cookie: cookie } }, (res) => {
        let buffer = '';
        res.on('data', (chunk) => {
          buffer += chunk.toString();
          let idx;
          while ((idx = buffer.indexOf('\n\n')) >= 0) {
            const block = buffer.slice(0, idx);
            buffer = buffer.slice(idx + 2);
            if (block.startsWith('event:')) {
              events.push(block);
              if (events.length === 1) resolve();
            }
          }
        });
      });
      req.on('error', () => {});
    });

    // Wait a tick for the SSE connection, then post.
    await new Promise(r => setTimeout(r, 100));
    await request(app).post('/api/items').set('Cookie', cookie).send({ content: 'hi' });
    await events$;
    expect(events[0]).toMatch(/event: item:created/);
    server.close();
  });

  it('reports connection count', () => {
    const hub = createSseHub();
    expect(hub.size()).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

Run: `npm test -- sse`
Expected: FAIL.

- [ ] **Step 3: Implement `server/sse.js`**

```js
const HEARTBEAT_MS = 25_000;

export function createSseHub() {
  const clients = new Set();

  function broadcast(event, data) {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of clients) {
      try { res.write(payload); } catch { /* will be cleaned up on close */ }
    }
  }

  function handler(req, res) {
    res.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();
    res.write(': connected\n\n');

    // Tell the new client the current count directly (so its UI is correct
    // immediately, without waiting for the next device change).
    const newCount = clients.size + 1;
    res.write(`event: devices:changed\ndata: ${JSON.stringify({ count: newCount })}\n\n`);

    // Tell existing clients about the new device. Done before adding the new
    // client to the set so it doesn't receive its own join event twice.
    broadcast('devices:changed', { count: newCount });
    clients.add(res);

    const heartbeat = setInterval(() => {
      try { res.write(': hb\n\n'); } catch { /* ignore */ }
    }, HEARTBEAT_MS);

    req.on('close', () => {
      clearInterval(heartbeat);
      clients.delete(res);
      broadcast('devices:changed', { count: clients.size });
    });
  }

  return {
    handler,
    broadcast,
    size: () => clients.size,
  };
}
```

- [ ] **Step 4: Modify `server/app.js` — accept and mount the SSE handler**

Update the function signature and add the route:
```js
export function createApp({ db, pin, uploadsDir, maxUploadBytes, broadcast = () => {}, sseHandler }) {
  // ... existing setup ...

  if (sseHandler) {
    app.get('/api/events', auth.requireAuth, sseHandler);
  }

  return app;
}
```

- [ ] **Step 5: Run tests — verify they pass**

Run: `npm test`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add server/sse.js server/app.js server/__tests__/sse.test.js
git commit -m "feat: add SSE hub for real-time item broadcasts"
```

---

### Task 10: Server entry point

Wires everything together, prints LAN URL + PIN, serves the built client.

**Files:**
- Create: `server/index.js`

- [ ] **Step 1: Implement `server/index.js`**

```js
import 'dotenv/config';
import path from 'node:path';
import fs from 'node:fs';
import express from 'express';
import { fileURLToPath } from 'node:url';
import { createDb } from './db.js';
import { createApp } from './app.js';
import { createSseHub } from './sse.js';
import { pickLanAddress } from './lan.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const PIN = process.env.PIN;
if (!PIN || !/^\d{4,6}$/.test(PIN)) {
  console.error('ERROR: PIN env var must be 4–6 digits. Copy .env.example to .env and set one.');
  process.exit(1);
}

const PORT = Number(process.env.PORT || 4123);
const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB || 50);
const DATA_DIR = path.resolve(ROOT, process.env.DATA_DIR || './data');

fs.mkdirSync(DATA_DIR, { recursive: true });
const uploadsDir = path.join(DATA_DIR, 'uploads');
fs.mkdirSync(uploadsDir, { recursive: true });

const db = createDb(path.join(DATA_DIR, 'localdrop.sqlite'));
const sse = createSseHub();

const app = createApp({
  db,
  pin: PIN,
  uploadsDir,
  maxUploadBytes: MAX_UPLOAD_MB * 1024 * 1024,
  broadcast: sse.broadcast,
  sseHandler: sse.handler,
});

// Serve built client
const distDir = path.join(ROOT, 'dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get('*', (_req, res) => res.sendFile(path.join(distDir, 'index.html')));
} else {
  console.warn('NOTE: dist/ not found. Run `npm run build` first, or use `npm run dev:client` for development.');
}

app.listen(PORT, '0.0.0.0', () => {
  const lan = pickLanAddress();
  console.log('\n  LocalDrop is running.\n');
  console.log(`  Laptop:  http://localhost:${PORT}`);
  console.log(`  Phone:   http://${lan}:${PORT}`);
  console.log(`  PIN:     ${PIN}\n`);
});
```

- [ ] **Step 2: Manually verify**

Run:
```bash
cp .env.example .env
npm run start
```

Expected: prints LAN URL and PIN. `curl -i http://localhost:4123/api/items` returns 401. `curl -i -X POST http://localhost:4123/api/auth -H 'Content-Type: application/json' -d '{"pin":"123456"}'` returns 200 with a Set-Cookie.

Stop the server with Ctrl+C.

- [ ] **Step 3: Commit**

```bash
git add server/index.js
git commit -m "feat: add server entrypoint with LAN URL printout"
```

---

## Phase 4 — Client scaffold

### Task 11: HTML shell, base CSS, Vite entry

Single HTML file containing both the PIN screen and the main UI. The active screen is toggled by a class on `<body>`.

**Files:**
- Create: `client/index.html`
- Create: `client/src/style.css`
- Create: `client/src/main.js`

- [ ] **Step 1: Create `client/index.html`**

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta name="theme-color" content="#15171c" />
  <link rel="manifest" href="/manifest.json" />
  <link rel="icon" href="/icons/icon-192.png" type="image/png" />
  <link rel="apple-touch-icon" href="/icons/icon-192.png" />
  <title>LocalDrop</title>
  <link rel="stylesheet" href="/src/style.css" />
</head>
<body class="screen-pin">
  <!-- PIN screen -->
  <section class="pin">
    <div class="pin-card">
      <h1>LocalDrop</h1>
      <p class="muted">Enter your PIN</p>
      <form id="pin-form" autocomplete="off" novalidate>
        <div class="pin-inputs" id="pin-inputs">
          <input maxlength="1" inputmode="numeric" />
          <input maxlength="1" inputmode="numeric" />
          <input maxlength="1" inputmode="numeric" />
          <input maxlength="1" inputmode="numeric" />
          <input maxlength="1" inputmode="numeric" />
          <input maxlength="1" inputmode="numeric" />
        </div>
        <button type="submit" class="btn primary">Unlock</button>
      </form>
    </div>
  </section>

  <!-- Main app -->
  <main class="app" hidden>
    <header class="topbar">
      <div class="brand"><span class="dot" id="conn-dot"></span> LocalDrop</div>
      <div class="meta"><span id="device-count">1</span> device<span id="device-plural">s</span></div>
    </header>

    <div class="actions">
      <button class="btn primary" id="btn-upload">⬆ Upload</button>
      <button class="btn primary" id="btn-paste">✎ Paste</button>
      <input type="file" id="file-input" accept="image/*" multiple hidden />
    </div>

    <div class="filterbar">
      <div class="chips" id="filter-chips">
        <button class="chip active" data-filter="all">All</button>
        <button class="chip" data-filter="image">Images</button>
        <button class="chip" data-filter="text">Text</button>
        <button class="chip" data-filter="link">Links</button>
        <button class="chip" data-filter="json">JSON</button>
      </div>
      <button class="view-toggle" id="view-toggle" title="Toggle grid">⊞</button>
    </div>

    <section class="composer" id="composer" hidden>
      <textarea id="composer-text" placeholder="Paste or type — links, JSON, or plain text"></textarea>
      <div class="composer-row">
        <span class="badge" id="composer-badge">Text</span>
        <button class="btn ghost" id="composer-cancel">Cancel</button>
        <button class="btn primary" id="composer-send">Send</button>
      </div>
    </section>

    <section class="feed" id="feed"></section>
    <button class="btn ghost load-more" id="load-more" hidden>Load more</button>

    <div class="dropzone" id="dropzone">
      <div>Drop images to upload</div>
    </div>
  </main>

  <div id="toast-host" class="toast-host"></div>
  <div class="lightbox" id="lightbox" hidden><img id="lightbox-img" alt="" /></div>

  <script type="module" src="/src/main.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create `client/src/style.css`** (per spec §8.6)

```css
:root {
  --bg: #0b0c10;
  --surface: #15171c;
  --surface-2: #1c1f26;
  --border: #23262d;
  --text: #e6e8ea;
  --muted: #8a8f98;
  --accent: #6366f1;
  --accent-hover: #7c7fff;
  --danger: #ef4444;
  --good: #10b981;
  --radius: 8px;
  --radius-lg: 12px;
}

* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: var(--bg); color: var(--text);
  font-family: -apple-system, "Segoe UI", Inter, system-ui, sans-serif; font-size: 14px; }
body { min-height: 100vh; }
body[hidden] { display: none; }

.muted { color: var(--muted); }

/* PIN screen */
body.screen-pin .app { display: none; }
body.screen-app .pin { display: none; }

.pin { min-height: 100vh; display: grid; place-items: center; padding: 16px; }
.pin-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg);
  padding: 32px; width: 100%; max-width: 360px; text-align: center; }
.pin-card h1 { margin: 0 0 4px; font-size: 22px; }
.pin-inputs { display: flex; gap: 8px; margin: 24px 0; justify-content: center; }
.pin-inputs input { width: 40px; height: 48px; text-align: center; font-size: 20px;
  background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius); color: var(--text); }
.pin-inputs input:focus { outline: 2px solid var(--accent); outline-offset: 1px; }
.pin-card.shake { animation: shake 0.3s; }
@keyframes shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-6px); }
  75% { transform: translateX(6px); }
}

/* App layout */
.app { max-width: 720px; margin: 0 auto; padding: 16px; padding-bottom: 80px; }

.topbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.brand { font-weight: 600; display: flex; align-items: center; gap: 8px; }
.dot { width: 8px; height: 8px; border-radius: 50%; background: var(--good); animation: pulse 2s infinite; }
.dot.disconnected { background: var(--muted); animation: none; }
@keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
.meta { color: var(--muted); font-size: 13px; }

.actions { display: flex; gap: 8px; margin-bottom: 16px; }
.actions .btn { flex: 1; }
@media (max-width: 360px) { .actions { flex-direction: column; } }

.btn { background: var(--surface); color: var(--text); border: 1px solid var(--border); border-radius: var(--radius);
  padding: 10px 16px; font-size: 14px; cursor: pointer; transition: background 150ms ease; font-weight: 500; }
.btn:hover { background: var(--surface-2); }
.btn.primary { background: var(--accent); border-color: var(--accent); }
.btn.primary:hover { background: var(--accent-hover); border-color: var(--accent-hover); }
.btn.ghost { background: transparent; }

.filterbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.chips { display: flex; gap: 6px; flex-wrap: wrap; }
.chip { background: var(--surface); color: var(--muted); border: 1px solid var(--border); border-radius: 999px;
  padding: 4px 12px; font-size: 13px; cursor: pointer; }
.chip.active { background: var(--accent); border-color: var(--accent); color: white; }
.view-toggle { background: var(--surface); color: var(--text); border: 1px solid var(--border);
  border-radius: var(--radius); padding: 4px 10px; cursor: pointer; }

.composer { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg);
  padding: 12px; margin-bottom: 12px; animation: slideDown 200ms ease; }
@keyframes slideDown { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: none; } }
.composer textarea { width: 100%; min-height: 120px; background: var(--surface-2); border: 1px solid var(--border);
  border-radius: var(--radius); padding: 8px; color: var(--text); font-family: ui-monospace, monospace; resize: vertical; }
.composer-row { display: flex; align-items: center; gap: 8px; margin-top: 8px; }
.composer-row .badge { color: var(--muted); font-size: 12px; padding: 4px 8px;
  border: 1px solid var(--border); border-radius: 999px; }
.composer-row > .btn:nth-of-type(1) { margin-left: auto; }

.feed { display: flex; flex-direction: column; gap: 12px; }
.feed.grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
@media (max-width: 540px) { .feed.grid { grid-template-columns: repeat(2, 1fr); } }

.card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 8px; }
.card-meta { display: flex; justify-content: space-between; color: var(--muted); font-size: 12px; margin-top: 6px; }
.card-actions { display: flex; gap: 4px; margin-top: 8px; }
.card-actions .btn { padding: 4px 10px; font-size: 12px; }

.card.image img { width: 100%; max-height: 200px; object-fit: cover; border-radius: var(--radius); display: block; cursor: zoom-in; }
.feed.grid .card { padding: 0; overflow: hidden; }
.feed.grid .card-meta, .feed.grid .card-actions { display: none; }
.feed.grid .card.image img { max-height: 160px; height: 160px; }
.feed.grid .card:not(.image) { display: none; }

.card.text pre, .card.json pre { margin: 0; font-family: ui-monospace, monospace; font-size: 13px;
  white-space: pre-wrap; word-break: break-word; max-height: calc(1.4em * 4); overflow: hidden; }
.card.expanded pre { max-height: none; }
.card.json .key { color: #93c5fd; }
.card.json .str { color: #86efac; }
.card.json .num { color: #fdba74; }
.card.json .bool { color: #f9a8d4; }

.card.link .link-row { display: flex; align-items: center; gap: 8px; }
.card.link img.favicon { width: 16px; height: 16px; }
.card.link .url { color: var(--muted); font-size: 12px; word-break: break-all; }
.card.link .title { font-weight: 500; }

.empty { text-align: center; color: var(--muted); padding: 64px 16px; }
.load-more { display: block; margin: 16px auto; }

.dropzone { position: fixed; inset: 0; background: rgba(99, 102, 241, 0.15); border: 2px dashed var(--accent);
  display: none; place-items: center; pointer-events: none; font-size: 18px; color: var(--text); z-index: 10; }
.dropzone.visible { display: grid; }

.toast-host { position: fixed; bottom: 16px; left: 50%; transform: translateX(-50%);
  display: flex; flex-direction: column; gap: 8px; z-index: 100; }
.toast { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
  padding: 10px 16px; box-shadow: 0 4px 12px rgba(0,0,0,0.3); animation: toastIn 200ms ease; }
.toast.error { border-color: var(--danger); }
@keyframes toastIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }

.lightbox { position: fixed; inset: 0; background: rgba(0,0,0,0.9); display: grid; place-items: center;
  z-index: 200; cursor: zoom-out; padding: 16px; }
.lightbox img { max-width: 100%; max-height: 100%; object-fit: contain; }
```

- [ ] **Step 3: Create `client/src/main.js` (just the boot stub for now)**

```js
console.log('LocalDrop client booted');
document.body.classList.add('screen-pin');
```

- [ ] **Step 4: Create `client/manifest.json`**

```json
{
  "name": "LocalDrop",
  "short_name": "LocalDrop",
  "description": "Self-hosted clipboard for your devices on the same WiFi.",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#0b0c10",
  "theme_color": "#15171c",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

- [ ] **Step 5: Generate placeholder icons**

Create the icons directory and generate two simple PNGs (any 192px and 512px image works as a placeholder; replace later with real artwork).

```bash
mkdir -p client/icons
node -e '
const fs = require("fs");
// Minimal solid-color PNG generator: write a tiny indigo square via canvas alternative.
// As a v1 placeholder we copy a simple 1x1 PNG and accept blurry icons until art is added.
const png1x1 = Buffer.from(
  "89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C489" +
  "0000000C49444154789C636060606300000005000164D7DDFF0000000049454E44AE426082",
  "hex"
);
fs.writeFileSync("client/icons/icon-192.png", png1x1);
fs.writeFileSync("client/icons/icon-512.png", png1x1);
console.log("placeholder icons written");
'
```

(Replace these with proper-resolution icons before any release. They satisfy the manifest validator for now.)

- [ ] **Step 6: Manual verify**

Run: `npm run dev:client`
Open: `http://localhost:5173`
Expected: PIN screen visible (six input boxes), no console errors except for `manifest icon` warnings.

Stop with Ctrl+C.

- [ ] **Step 7: Commit**

```bash
git add client/
git commit -m "feat: add client HTML shell, base CSS, and PWA manifest"
```

---

### Task 12: API wrapper, toast system, lightbox

Three small client modules used by everything else.

**Files:**
- Create: `client/src/api.js`
- Create: `client/src/toast.js`
- Create: `client/src/lightbox.js`

- [ ] **Step 1: Create `client/src/api.js`**

```js
async function request(method, path, { body, isForm = false } = {}) {
  const opts = { method, credentials: 'same-origin' };
  if (body !== undefined) {
    if (isForm) {
      opts.body = body;
    } else {
      opts.body = JSON.stringify(body);
      opts.headers = { 'Content-Type': 'application/json' };
    }
  }
  const res = await fetch(path, opts);
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = new Error(data?.error || `http_${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export const api = {
  login: (pin) => request('POST', '/api/auth', { body: { pin } }),
  listItems: (params = {}) => {
    const qs = new URLSearchParams();
    if (params.before) qs.set('before', params.before);
    if (params.limit) qs.set('limit', params.limit);
    return request('GET', `/api/items${qs.toString() ? `?${qs}` : ''}`);
  },
  createItem: (content) => request('POST', '/api/items', { body: { content } }),
  uploadFile: (file) => {
    const fd = new FormData();
    fd.append('file', file);
    return request('POST', '/api/items', { body: fd, isForm: true });
  },
  deleteItem: (id) => request('DELETE', `/api/items/${id}`),
};
```

- [ ] **Step 2: Create `client/src/toast.js`**

```js
const host = () => document.getElementById('toast-host');

export function toast(message, { error = false, duration = 2000 } = {}) {
  const el = document.createElement('div');
  el.className = `toast${error ? ' error' : ''}`;
  el.textContent = message;
  host().appendChild(el);
  if (!error) {
    setTimeout(() => el.remove(), duration);
  } else {
    el.style.cursor = 'pointer';
    el.addEventListener('click', () => el.remove(), { once: true });
  }
}
```

- [ ] **Step 3: Create `client/src/lightbox.js`**

```js
export function setupLightbox() {
  const root = document.getElementById('lightbox');
  const img = document.getElementById('lightbox-img');
  function close() { root.hidden = true; img.src = ''; }
  root.addEventListener('click', close);
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  return {
    open(src) {
      img.src = src;
      root.hidden = false;
    },
  };
}
```

- [ ] **Step 4: Commit**

```bash
git add client/src/api.js client/src/toast.js client/src/lightbox.js
git commit -m "feat: add client API wrapper, toast, and lightbox"
```

---

### Task 13: PIN screen flow

**Files:**
- Create: `client/src/pin.js`

- [ ] **Step 1: Create `client/src/pin.js`**

```js
import { api } from './api.js';

export function setupPin({ onUnlock }) {
  const inputs = Array.from(document.querySelectorAll('#pin-inputs input'));
  const form = document.getElementById('pin-form');
  const card = document.querySelector('.pin-card');

  inputs.forEach((input, i) => {
    input.addEventListener('input', () => {
      input.value = input.value.replace(/\D/g, '').slice(0, 1);
      if (input.value && i < inputs.length - 1) inputs[i + 1].focus();
      if (i === inputs.length - 1 && input.value) form.requestSubmit();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !input.value && i > 0) inputs[i - 1].focus();
    });
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const pin = inputs.map((i) => i.value).join('');
    if (pin.length < 4) return;
    try {
      await api.login(pin);
      onUnlock();
    } catch {
      card.classList.add('shake');
      setTimeout(() => card.classList.remove('shake'), 300);
      inputs.forEach((i) => (i.value = ''));
      inputs[0].focus();
    }
  });

  inputs[0]?.focus();
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/pin.js
git commit -m "feat: add PIN screen flow"
```

---

### Task 14: Card renderers (image/text/link/json)

**Files:**
- Create: `client/src/render.js`

- [ ] **Step 1: Create `client/src/render.js`**

```js
import { api } from './api.js';
import { toast } from './toast.js';

const fmtBytes = (n) => {
  if (n == null) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
};

const relTime = (ms) => {
  const diff = Math.max(0, Date.now() - ms);
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

function highlightJson(s) {
  // Simple regex highlighter; safe because we replace inside textContent first.
  return s
    .replace(/"([^"\\]*(?:\\.[^"\\]*)*)"(\s*:)/g, '<span class="key">"$1"</span>$2')
    .replace(/:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/g, ': <span class="str">"$1"</span>')
    .replace(/:\s*(-?\d+(?:\.\d+)?)/g, ': <span class="num">$1</span>')
    .replace(/:\s*(true|false|null)/g, ': <span class="bool">$1</span>');
}

function escapeHtml(s) {
  return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

function favicon(url) {
  try {
    const u = new URL(url);
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(u.hostname)}&sz=32`;
  } catch {
    return '';
  }
}

async function copyText(s) {
  try {
    await navigator.clipboard.writeText(s);
    toast('Copied');
  } catch {
    toast('Copy failed', { error: true });
  }
}

async function copyImageOrUrl(item) {
  const url = `${location.origin}/api/uploads/${item.content}`;
  if (navigator.clipboard?.write && window.ClipboardItem) {
    try {
      const blob = await fetch(url, { credentials: 'same-origin' }).then((r) => r.blob());
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
      toast('Image copied');
      return;
    } catch { /* fall through */ }
  }
  await copyText(url);
}

function actionRow(buttons) {
  const row = document.createElement('div');
  row.className = 'card-actions';
  for (const [label, fn] of buttons) {
    const b = document.createElement('button');
    b.className = 'btn';
    b.textContent = label;
    b.addEventListener('click', fn);
    row.appendChild(b);
  }
  return row;
}

async function deleteItem(item, card) {
  try {
    await api.deleteItem(item.id);
    card.remove();
    toast('Deleted');
  } catch {
    toast('Delete failed', { error: true });
  }
}

export function renderCard(item, ctx) {
  const card = document.createElement('article');
  card.className = `card ${item.type}`;
  card.dataset.id = item.id;
  card.dataset.type = item.type;
  card.dataset.createdAt = item.created_at;

  if (item.type === 'image') {
    const img = document.createElement('img');
    img.src = `/api/uploads/${item.content}`;
    img.alt = item.original_filename || '';
    img.addEventListener('click', () => ctx.lightbox.open(img.src));
    card.appendChild(img);

    const meta = document.createElement('div');
    meta.className = 'card-meta';
    meta.innerHTML = `<span>${escapeHtml(item.original_filename || '')}</span><span>${fmtBytes(item.size)} · ${relTime(item.created_at)}</span>`;
    card.appendChild(meta);

    card.appendChild(actionRow([
      ['Copy', () => copyImageOrUrl(item)],
      ['Download', () => { const a = document.createElement('a'); a.href = `/api/uploads/${item.content}`; a.download = item.original_filename || item.content; a.click(); }],
      ['Delete', () => deleteItem(item, card)],
    ]));
    return card;
  }

  if (item.type === 'link') {
    const row = document.createElement('div');
    row.className = 'link-row';
    const fav = favicon(item.content);
    if (fav) {
      const i = document.createElement('img');
      i.className = 'favicon'; i.src = fav; i.alt = '';
      row.appendChild(i);
    }
    const text = document.createElement('div');
    text.innerHTML = `${item.link_title ? `<div class="title">${escapeHtml(item.link_title)}</div>` : ''}<div class="url">${escapeHtml(item.content)}</div>`;
    row.appendChild(text);
    card.appendChild(row);

    const meta = document.createElement('div');
    meta.className = 'card-meta';
    meta.innerHTML = `<span></span><span>${relTime(item.created_at)}</span>`;
    card.appendChild(meta);

    card.appendChild(actionRow([
      ['Copy', () => copyText(item.content)],
      ['Open', () => window.open(item.content, '_blank', 'noopener')],
      ['Delete', () => deleteItem(item, card)],
    ]));
    return card;
  }

  if (item.type === 'json' || item.type === 'text') {
    const pre = document.createElement('pre');
    let formatted = item.content;
    if (item.type === 'json') {
      try { formatted = JSON.stringify(JSON.parse(item.content), null, 2); } catch { /* keep as-is */ }
      pre.innerHTML = highlightJson(escapeHtml(formatted));
    } else {
      pre.textContent = formatted;
    }
    pre.addEventListener('click', () => card.classList.toggle('expanded'));
    card.appendChild(pre);

    const meta = document.createElement('div');
    meta.className = 'card-meta';
    meta.innerHTML = `<span>${item.type === 'json' ? 'JSON' : 'Text'}</span><span>${fmtBytes(item.size)} · ${relTime(item.created_at)}</span>`;
    card.appendChild(meta);

    card.appendChild(actionRow([
      ['Copy', () => copyText(item.content)],
      ['Delete', () => deleteItem(item, card)],
    ]));
    return card;
  }

  return card;
}

export function setupTimestampRefresh() {
  setInterval(() => {
    document.querySelectorAll('.card').forEach((c) => {
      const ts = Number(c.dataset.createdAt);
      const span = c.querySelector('.card-meta span:last-child');
      if (!span) return;
      const text = span.textContent;
      // Replace the trailing "Xy ago" portion only
      span.textContent = text.replace(/[^·]*ago$/, relTime(ts));
    });
  }, 30_000);
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/render.js
git commit -m "feat: add per-type card renderers"
```

---

### Task 15: Composer (paste/type with auto-detection)

**Files:**
- Create: `client/src/composer.js`

- [ ] **Step 1: Create `client/src/composer.js`**

```js
import { api } from './api.js';
import { toast } from './toast.js';

const URL_RE = /^https?:\/\/\S+$/;

function detect(s) {
  const trimmed = s.trim();
  if (URL_RE.test(trimmed)) return 'Link';
  try {
    const v = JSON.parse(trimmed);
    if (v !== null && typeof v === 'object') return 'JSON';
  } catch { /* */ }
  return 'Text';
}

export function setupComposer() {
  const panel = document.getElementById('composer');
  const text = document.getElementById('composer-text');
  const badge = document.getElementById('composer-badge');
  const cancel = document.getElementById('composer-cancel');
  const send = document.getElementById('composer-send');
  const openBtn = document.getElementById('btn-paste');

  function updateBadge() {
    badge.textContent = `Detected: ${detect(text.value)}`;
  }

  function open(prefill = '') {
    panel.hidden = false;
    text.value = prefill;
    updateBadge();
    text.focus();
  }
  function close() {
    panel.hidden = true;
    text.value = '';
  }

  openBtn.addEventListener('click', () => open());
  cancel.addEventListener('click', close);
  text.addEventListener('input', updateBadge);

  send.addEventListener('click', async () => {
    const value = text.value.trim();
    if (!value) return;
    try {
      await api.createItem(value);
      close();
    } catch (err) {
      toast(err.message || 'Send failed', { error: true });
    }
  });

  return { open, close };
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/composer.js
git commit -m "feat: add paste composer with auto type detection"
```

---

### Task 16: Upload, drag-drop, clipboard image

**Files:**
- Create: `client/src/upload.js`

- [ ] **Step 1: Create `client/src/upload.js`**

```js
import { api } from './api.js';
import { toast } from './toast.js';

async function uploadAll(files) {
  for (const file of files) {
    if (!file.type.startsWith('image/')) {
      toast('Only images can be uploaded — paste text/links/JSON via the Paste button.', { error: true });
      continue;
    }
    try {
      await api.uploadFile(file);
    } catch (err) {
      if (err.data?.error === 'file_too_large') {
        toast(`File too large (max ${err.data.maxBytes / 1024 / 1024} MB)`, { error: true });
      } else {
        toast('Upload failed', { error: true });
      }
    }
  }
}

export function setupUpload({ composer }) {
  const fileInput = document.getElementById('file-input');
  const uploadBtn = document.getElementById('btn-upload');
  const dropzone = document.getElementById('dropzone');

  uploadBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    if (fileInput.files?.length) uploadAll(Array.from(fileInput.files));
    fileInput.value = '';
  });

  let depth = 0;
  window.addEventListener('dragenter', (e) => {
    if (!Array.from(e.dataTransfer?.types || []).includes('Files')) return;
    depth++;
    dropzone.classList.add('visible');
  });
  window.addEventListener('dragleave', () => {
    depth = Math.max(0, depth - 1);
    if (depth === 0) dropzone.classList.remove('visible');
  });
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    depth = 0;
    dropzone.classList.remove('visible');
    const files = Array.from(e.dataTransfer?.files || []);
    if (files.length) uploadAll(files);
  });

  // Global paste
  window.addEventListener('paste', (e) => {
    if (document.activeElement?.tagName === 'TEXTAREA' || document.activeElement?.tagName === 'INPUT') return;
    const items = Array.from(e.clipboardData?.items || []);
    const imageItem = items.find((i) => i.type.startsWith('image/'));
    if (imageItem) {
      const file = imageItem.getAsFile();
      if (file) uploadAll([file]);
      return;
    }
    const textData = e.clipboardData?.getData('text');
    if (textData) {
      e.preventDefault();
      composer.open(textData);
    }
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/upload.js
git commit -m "feat: add upload, drag-drop, and clipboard-image paste"
```

---

### Task 17: Feed controller (filter, view toggle, load more, SSE)

**Files:**
- Create: `client/src/feed.js`

- [ ] **Step 1: Create `client/src/feed.js`**

```js
import { api } from './api.js';
import { renderCard } from './render.js';
import { toast } from './toast.js';

export function setupFeed({ lightbox }) {
  const feed = document.getElementById('feed');
  const chips = Array.from(document.querySelectorAll('#filter-chips .chip'));
  const viewToggle = document.getElementById('view-toggle');
  const loadMore = document.getElementById('load-more');
  const deviceCount = document.getElementById('device-count');
  const devicePlural = document.getElementById('device-plural');
  const connDot = document.getElementById('conn-dot');

  let currentFilter = 'all';
  let isGrid = false;
  let oldestLoaded = null;

  function applyFilter() {
    feed.querySelectorAll('.card').forEach((card) => {
      const t = card.dataset.type;
      card.style.display = (currentFilter === 'all' || currentFilter === t) ? '' : 'none';
    });
  }

  function prepend(item) {
    const card = renderCard(item, { lightbox });
    if (currentFilter !== 'all' && currentFilter !== item.type) card.style.display = 'none';
    if (feed.firstChild) feed.insertBefore(card, feed.firstChild); else feed.appendChild(card);
    updateEmpty();
  }

  function append(item) {
    const card = renderCard(item, { lightbox });
    if (currentFilter !== 'all' && currentFilter !== item.type) card.style.display = 'none';
    feed.appendChild(card);
    if (item.created_at < (oldestLoaded ?? Infinity)) oldestLoaded = item.created_at;
    updateEmpty();
  }

  function remove(id) {
    const card = feed.querySelector(`.card[data-id="${CSS.escape(id)}"]`);
    if (card) card.remove();
    updateEmpty();
  }

  function update(item) {
    const card = feed.querySelector(`.card[data-id="${CSS.escape(item.id)}"]`);
    if (!card) return;
    const replacement = renderCard(item, { lightbox });
    if (currentFilter !== 'all' && currentFilter !== item.type) replacement.style.display = 'none';
    card.replaceWith(replacement);
  }

  function updateEmpty() {
    const has = feed.querySelector('.card');
    let empty = feed.querySelector('.empty');
    if (!has && !empty) {
      empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = 'No items yet. Drop a file or paste something to get started.';
      feed.appendChild(empty);
    } else if (has && empty) {
      empty.remove();
    }
  }

  async function initialLoad() {
    try {
      const { items, hasMore } = await api.listItems({ limit: 50 });
      items.forEach(append);
      loadMore.hidden = !hasMore;
      updateEmpty();
    } catch (e) {
      toast('Failed to load items', { error: true });
    }
  }

  loadMore.addEventListener('click', async () => {
    try {
      const { items, hasMore } = await api.listItems({ before: oldestLoaded, limit: 50 });
      items.forEach(append);
      loadMore.hidden = !hasMore;
    } catch {
      toast('Failed to load more', { error: true });
    }
  });

  chips.forEach((chip) => {
    chip.addEventListener('click', () => {
      chips.forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      currentFilter = chip.dataset.filter;
      applyFilter();
    });
  });

  viewToggle.addEventListener('click', () => {
    isGrid = !isGrid;
    feed.classList.toggle('grid', isGrid);
    viewToggle.textContent = isGrid ? '☰' : '⊞';
    if (isGrid) {
      // auto-activate Images filter
      chips.forEach((c) => c.classList.toggle('active', c.dataset.filter === 'image'));
      currentFilter = 'image';
      applyFilter();
    }
  });

  function connectSse() {
    const es = new EventSource('/api/events');
    es.addEventListener('open', () => connDot.classList.remove('disconnected'));
    es.addEventListener('error', () => connDot.classList.add('disconnected'));
    es.addEventListener('item:created', (e) => prepend(JSON.parse(e.data)));
    es.addEventListener('item:deleted', (e) => remove(JSON.parse(e.data).id));
    es.addEventListener('item:updated', (e) => update(JSON.parse(e.data)));
    es.addEventListener('devices:changed', (e) => {
      const { count } = JSON.parse(e.data);
      deviceCount.textContent = String(count);
      devicePlural.style.display = count === 1 ? 'none' : '';
    });
    return es;
  }

  return { initialLoad, connectSse };
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/feed.js
git commit -m "feat: add feed controller with filter, view toggle, and SSE"
```

---

### Task 18: Wire it all together in `main.js`

**Files:**
- Modify: `client/src/main.js`

- [ ] **Step 1: Replace `client/src/main.js`**

```js
import { setupPin } from './pin.js';
import { setupLightbox } from './lightbox.js';
import { setupComposer } from './composer.js';
import { setupUpload } from './upload.js';
import { setupFeed } from './feed.js';
import { setupTimestampRefresh } from './render.js';
import { api } from './api.js';

async function bootApp() {
  document.body.classList.remove('screen-pin');
  document.body.classList.add('screen-app');
  document.querySelector('.app').hidden = false;

  const lightbox = setupLightbox();
  const feed = setupFeed({ lightbox });
  const composer = setupComposer();
  setupUpload({ composer });
  setupTimestampRefresh();

  await feed.initialLoad();
  feed.connectSse();
}

async function init() {
  // Probe auth: a 401 means we need PIN.
  try {
    await api.listItems({ limit: 1 });
    bootApp();
  } catch (e) {
    if (e.status === 401) {
      setupPin({ onUnlock: bootApp });
    } else {
      // Network error or other; show PIN screen anyway as a fallback.
      setupPin({ onUnlock: bootApp });
    }
  }
}

init();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => { /* ignore in dev */ });
  });
}
```

- [ ] **Step 2: Manually verify the full client end-to-end**

Run the server and dev client in two terminals:
```bash
# terminal 1
npm run start
# terminal 2
npm run dev:client
```

Open `http://localhost:5173` in two browser windows.
- Enter the PIN in window A → main UI appears.
- Enter the PIN in window B → main UI appears.
- Paste in A → check that B sees the new card within ~1s.
- Upload an image in B → check that A sees the image card within ~1s.
- Delete an item in A → check that B removes it.

Stop both with Ctrl+C.

- [ ] **Step 3: Commit**

```bash
git add client/src/main.js
git commit -m "feat: wire client modules together"
```

---

### Task 19: Service worker

App-shell cache for offline-installable behavior. Network-only for `/api/*`.

**Files:**
- Create: `client/sw.js`

- [ ] **Step 1: Create `client/sw.js`**

```js
const VERSION = 'v1';
const SHELL_CACHE = `localdrop-shell-${VERSION}`;
const SHELL_ASSETS = ['/', '/index.html', '/manifest.json'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL_CACHE).then((c) => c.addAll(SHELL_ASSETS)));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== SHELL_CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/')) return; // network-only
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      if (res.ok && e.request.method === 'GET') {
        const copy = res.clone();
        caches.open(SHELL_CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
      }
      return res;
    }).catch(() => caches.match('/index.html')))
  );
});
```

- [ ] **Step 2: Manual verify**

Run `npm run build` then `npm run start`. Open `http://localhost:4123`, install as PWA (Chrome menu → Install LocalDrop), close and reopen — the shell should load from cache.

- [ ] **Step 3: Commit**

```bash
git add client/sw.js
git commit -m "feat: add service worker for app-shell caching"
```

---

## Phase 5 — Documentation & final pass

### Task 20: README

**Files:**
- Create: `README.md`

- [ ] **Step 1: Create `README.md`**

```markdown
# LocalDrop

A self-hosted PWA for transferring images, text, links, and JSON between your phone and laptop on the same WiFi network.

## Quick start

1. Install Node.js 20 or newer.
2. Clone this repo and install deps:
   ```
   npm install
   ```
3. Configure your PIN:
   ```
   cp .env.example .env
   # edit .env and set PIN to a 4–6 digit code
   ```
4. Build the client and start the server:
   ```
   npm run build
   npm run start
   ```
5. The terminal prints two URLs and your PIN, e.g.:
   ```
   Laptop:  http://localhost:4123
   Phone:   http://192.168.1.10:4123
   PIN:     123456
   ```
6. Open the laptop URL on your laptop and the phone URL on your phone (must be on the same WiFi). Enter the PIN once on each device.

## Development

In two terminals:
```
npm run dev:server    # API on :4123
npm run dev:client    # Vite dev server on :5173, proxies /api to :4123
```

## Tests

```
npm test
```

## Limitations

- iOS Safari requires HTTPS to install as a PWA. Over plain HTTP on LAN the app still works fully but Add-to-Home-Screen will be a regular bookmark, not a standalone PWA.
- Only images can be uploaded as files. Text, links, and JSON go through the Paste button.
- All items are stored unencrypted on the laptop (LAN-only access, but the data lives in `data/localdrop.sqlite` and `data/uploads/`).

## Configuration

| Var | Default | Notes |
|---|---|---|
| `PIN` | (required) | 4–6 digits |
| `PORT` | `4123` | non-3000 to avoid conflicts |
| `MAX_UPLOAD_MB` | `50` | per-file cap |
| `DATA_DIR` | `./data` | sqlite + uploads parent |
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add README with setup and usage"
```

---

### Task 21: Manual end-to-end smoke test checklist

This is a manual verification pass. Execute and check off each item.

- [ ] **Step 1: Build and run**

```bash
npm install
npm run build
npm run start
```

- [ ] **Step 2: Verify PIN flow**

- Open the laptop URL in a fresh incognito window.
- Wrong PIN → card shakes, inputs clear.
- Correct PIN → main UI appears.
- Reload page → no PIN prompt (cookie persists).

- [ ] **Step 3: Verify cross-device transfer**

On a phone connected to the same WiFi:
- Open the LAN URL printed by the server, enter PIN.
- Header should show "2 devices" within ~1 second.
- Paste a URL on the phone → laptop sees a link card with title (give it a couple seconds for OG fetch).
- Upload an image from the laptop → phone sees the image card within ~1 second.
- Click delete on the laptop → image disappears on the phone.

- [ ] **Step 4: Verify upload limits and errors**

- Try to drag a `.txt` file onto the page → error toast "Only images can be uploaded…".
- Try to upload an image larger than `MAX_UPLOAD_MB` → error toast about file size.

- [ ] **Step 5: Verify gallery view**

- Upload a few images.
- Click `⊞` view toggle → grid view, only images shown, "Images" filter chip auto-activated.
- Click `☰` to toggle back.

- [ ] **Step 6: Verify SSE reconnect**

- Stop the server (Ctrl+C). Connection dot turns gray.
- Restart server. Within 30 seconds, dot turns green again.

- [ ] **Step 7: Verify rate limit**

- Sign out (clear cookies in DevTools).
- Submit wrong PIN 6 times in a row → 6th attempt returns 429 (use the Network tab).

- [ ] **Step 8: Commit any tweaks made during smoke testing**

```bash
git add -A
git commit -m "chore: smoke-test fixes"   # if applicable
```

---

### Task 22: Update spec to reflect implementation details discovered

The implementation introduced a `devices:changed` SSE event and an `item:updated` event (for OG title arriving after the initial create). Update the spec.

**Files:**
- Modify: `docs/superpowers/specs/2026-05-01-localdrop-design.md`

- [ ] **Step 1: Update the SSE event format section in §6**

Find the block that lists SSE events and replace with:
```
event: item:created
data: {...full Item...}

event: item:updated
data: {...full Item...}    // emitted when OG title is fetched for a link

event: item:deleted
data: {"id":"..."}

event: devices:changed
data: {"count": <int>}     // emitted when a client connects or disconnects
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/specs/2026-05-01-localdrop-design.md
git commit -m "docs: document new SSE events emitted by implementation"
```

---

## Done

At this point you have:
- A working server with full test coverage on the API (Tasks 2–9).
- A PWA client that boots, authenticates, renders typed cards, and stays in sync across devices (Tasks 11–19).
- README and a smoke-test checklist (Tasks 20–21).
- Spec updated to match what was actually built (Task 22).

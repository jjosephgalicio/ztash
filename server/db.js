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

  let lastTimestamp = 0;

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
        let now = Date.now();
        if (now <= lastTimestamp) {
          now = lastTimestamp + 1;
        }
        lastTimestamp = now;
        const row = {
          id: randomUUID(),
          type: input.type,
          content: input.content,
          mime: input.mime ?? null,
          size: input.size ?? null,
          original_filename: input.original_filename ?? null,
          link_title: input.link_title ?? null,
          created_at: now,
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

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

  it('paginates with before cursor', () => {
    const first = db.items.insert({ type: 'text', content: 'a', size: 1 });
    db.items.insert({ type: 'text', content: 'b', size: 1 });
    const { items } = db.items.list({ before: first.created_at + 1, limit: 1 });
    expect(items[0].content).toBe('b');
  });

  it('deletes an item', () => {
    const item = db.items.insert({ type: 'text', content: 'x', size: 1 });
    expect(db.items.remove(item.id)).toBe(true);
    expect(db.items.findById(item.id)).toBeUndefined();
    expect(db.items.remove('nonexistent')).toBe(false);
  });
});

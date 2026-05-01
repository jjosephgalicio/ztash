import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { createDb } from '../db.js';
import { vi, beforeAll, afterAll } from 'vitest';
beforeAll(() => { vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false })); });
afterAll(() => { vi.unstubAllGlobals(); });

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

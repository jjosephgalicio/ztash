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
    expect(res.headers['set-cookie']?.[0]).toMatch(/ztash_session=/);
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

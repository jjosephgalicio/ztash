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

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

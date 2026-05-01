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

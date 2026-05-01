import 'dotenv/config';
import path from 'node:path';
import fs from 'node:fs';
import express from 'express';
import qrcode from 'qrcode-terminal';
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

const db = createDb(path.join(DATA_DIR, 'ztash.sqlite'));
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

// PID file lets `ztash --stop` find this process later. On graceful exit
// we remove it; if the process is force-killed (Windows), the next start
// or --stop call cleans up.
const pidFile = path.join(DATA_DIR, 'ztash.pid');

const server = app.listen(PORT, '0.0.0.0', () => {
  fs.writeFileSync(pidFile, String(process.pid));
  const lan = pickLanAddress();
  const phoneUrl = `http://${lan}:${PORT}`;
  console.log('\n  Ztash is running.\n');
  console.log(`  Laptop:  http://localhost:${PORT}`);
  console.log(`  Phone:   ${phoneUrl}`);
  console.log(`  PIN:     ${PIN}\n`);
  console.log('  Scan with your phone camera:\n');
  qrcode.generate(phoneUrl, { small: true }, (qr) => {
    process.stdout.write(qr.split('\n').map((line) => '  ' + line).join('\n') + '\n');
    console.log('\n  Press Ctrl+C to stop, or run `npx @jjosephgalicio/ztash --stop` from another terminal.\n');
  });
});

function shutdown() {
  try { fs.unlinkSync(pidFile); } catch { /* may already be gone */ }
  server.close(() => process.exit(0));
  // Force exit after 2s in case open SSE connections delay close().
  setTimeout(() => process.exit(0), 2000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n  ERROR: port ${PORT} is already in use.`);
    console.error('  Another Ztash (or some other app) is already listening here.');
    console.error('  Pick a different port:');
    console.error(`    npx @jjosephgalicio/ztash --port ${PORT + 1}`);
    console.error('  ...or stop whatever is holding the port and try again.\n');
    process.exit(1);
  }
  if (err.code === 'EACCES') {
    console.error(`\n  ERROR: not allowed to listen on port ${PORT}.`);
    console.error('  Ports below 1024 require admin privileges; pick something higher.\n');
    process.exit(1);
  }
  throw err;
});

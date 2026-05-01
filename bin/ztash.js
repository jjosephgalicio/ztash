#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin, stdout, stderr } from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);

function flag(name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

if (args.includes('--help') || args.includes('-h')) {
  stdout.write(`Usage: npx ztash [options]

Options:
  --pin <code>        Override the saved PIN (4-6 digits)
  --port <port>       HTTP port (default 4123)
  --data-dir <path>   Where to store sqlite + uploads (default ~/.ztash)
  --help, -h          Show this help
  --version, -v       Print version

On first run, ztash prompts for a PIN and saves it to <data-dir>/.pin.
Run again later and it picks up the saved PIN.
`);
  process.exit(0);
}

if (args.includes('--version') || args.includes('-v')) {
  const pkg = JSON.parse(readFileSync(path.resolve(here, '..', 'package.json'), 'utf8'));
  stdout.write(`${pkg.version}\n`);
  process.exit(0);
}

const dataDir = path.resolve(flag('--data-dir') || path.join(os.homedir(), '.ztash'));
mkdirSync(dataDir, { recursive: true });

async function resolvePin() {
  const cliPin = flag('--pin');
  if (cliPin) return validatePin(cliPin);
  if (process.env.PIN) return validatePin(process.env.PIN);

  const stateFile = path.join(dataDir, '.pin');
  if (existsSync(stateFile)) {
    const saved = readFileSync(stateFile, 'utf8').trim();
    if (/^\d{4,6}$/.test(saved)) return saved;
  }

  const rl = readline.createInterface({ input: stdin, output: stdout });
  let pin;
  while (true) {
    pin = (await rl.question('Set a PIN for Ztash (4-6 digits): ')).trim();
    if (/^\d{4,6}$/.test(pin)) break;
    stdout.write('  PIN must be 4-6 digits. Try again.\n');
  }
  rl.close();
  writeFileSync(stateFile, pin, { mode: 0o600 });
  stdout.write(`Saved to ${stateFile}\n\n`);
  return pin;
}

function validatePin(p) {
  if (!/^\d{4,6}$/.test(p)) {
    stderr.write('ERROR: PIN must be 4-6 digits.\n');
    process.exit(1);
  }
  return p;
}

process.env.PIN = await resolvePin();
process.env.DATA_DIR = dataDir;
const port = flag('--port');
if (port) process.env.PORT = port;

// Hand off to the server. server/index.js prints the LAN banner itself.
// Use file:// URL so dynamic import works on Windows too.
await import(pathToFileURL(path.resolve(here, '..', 'server', 'index.js')).href);

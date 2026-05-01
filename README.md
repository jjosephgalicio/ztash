# Ztash

A self-hosted PWA for transferring images, text, links, and JSON between your phone and laptop on the same WiFi.

Runs locally on your machine. No accounts, no cloud, no fees. Your storage, your network.

🌐 **Landing page:** [ztash.netlify.app](https://ztash.netlify.app)

## Quick start

```sh
npx ztash
```

That's it. First run prompts for a 4–6 digit PIN and saves it to `~/.ztash/.pin`. Ztash prints two URLs:

```
  Laptop:  http://localhost:4123
  Phone:   http://192.168.1.10:4123
  PIN:     123456
```

Open the **Phone** URL on your phone (same WiFi as the laptop), enter the PIN, and start sending things back and forth.

Requires **Node.js 22.5 or newer** (Ztash uses `node:sqlite` from stdlib — no native build).

## CLI flags

```
npx ztash [options]

  --pin <code>       Override the saved PIN (4-6 digits)
  --port <port>      HTTP port (default 4123)
  --data-dir <path>  Where to store sqlite + uploads (default ~/.ztash)
  --version          Print version
  --help             Show help
```

## Limitations

- **iOS PWA install needs HTTPS.** On plain HTTP, Add-to-Home-Screen falls back to a regular bookmark. The app still works fully.
- **Only images can be uploaded as files.** Text, links, and JSON go through the Paste button.
- **Browser binary clipboard requires HTTPS.** On plain HTTP, the in-app "Copy image" button falls back to copying the image's URL. Use the **Open** button → right-click → Copy image to get bytes into apps like Paint.
- **Items aren't encrypted on disk.** Data lives in `~/.ztash/ztash.sqlite` and `~/.ztash/uploads/`. Delete the dir to wipe everything.

## Development

Clone the repo, then:

```sh
npm install
cp .env.example .env   # then edit PIN
npm run dev:server     # API on :4123
npm run dev:client     # Vite dev server on :5173 (other terminal)
```

Run tests:

```sh
npm test
```

## Configuration

| Env var | Default | Notes |
|---|---|---|
| `PIN` | (required) | 4–6 digits |
| `PORT` | `4123` | Non-3000 to avoid conflicts with common dev servers |
| `MAX_UPLOAD_MB` | `50` | Per-file cap on image uploads |
| `DATA_DIR` | `./data` (when run from repo) / `~/.ztash` (when run via `npx`) | SQLite + uploads parent |

CLI flags (`--pin`, `--port`, `--data-dir`) override env vars. Env vars override the saved PIN file.

## Architecture

- **Server:** Node.js + Express, ~7 source files. SQLite via `node:sqlite` (stdlib). Server-Sent Events for real-time push to all connected clients.
- **Client:** Vite + vanilla JS, ~16 KB gzipped. PWA with service worker, installable on Android. Type-aware cards (image / text / link / JSON), filter chips, gallery view.
- **Auth:** PIN gate via httpOnly cookie. Constant-time compare, rate-limited login attempts.

See [`docs/superpowers/specs/`](docs/superpowers/specs/) for the design spec.

## License

MIT — see [LICENSE](LICENSE).

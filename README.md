# Ztash

A self-hosted PWA for transferring images, text, links, and JSON between your phone and laptop on the same WiFi network.

## Quick start

1. Install Node.js 22.5 or newer (uses `node:sqlite` from stdlib).
2. Clone this repo and install deps:
   ```
   npm install
   ```
3. Configure your PIN:
   ```
   cp .env.example .env
   # edit .env and set PIN to a 4–6 digit code
   ```
4. Build the client and start the server:
   ```
   npm run build
   npm run start
   ```
5. The terminal prints two URLs and your PIN, e.g.:
   ```
   Laptop:  http://localhost:4123
   Phone:   http://192.168.1.10:4123
   PIN:     123456
   ```
6. Open the laptop URL on your laptop and the phone URL on your phone (must be on the same WiFi). Enter the PIN once on each device.

## Development

In two terminals:
```
npm run dev:server    # API on :4123
npm run dev:client    # Vite dev server on :5173, proxies /api to :4123
```

## Tests

```
npm test
```

## Limitations

- iOS Safari requires HTTPS to install as a PWA. Over plain HTTP on LAN the app still works fully but Add-to-Home-Screen will be a regular bookmark, not a standalone PWA.
- Only images can be uploaded as files. Text, links, and JSON go through the Paste button.
- All items are stored unencrypted on the laptop (LAN-only access, but the data lives in `data/ztash.sqlite` and `data/uploads/`).

## Configuration

| Var | Default | Notes |
|---|---|---|
| `PIN` | (required) | 4–6 digits |
| `PORT` | `4123` | non-3000 to avoid conflicts |
| `MAX_UPLOAD_MB` | `50` | per-file cap |
| `DATA_DIR` | `./data` | sqlite + uploads parent |

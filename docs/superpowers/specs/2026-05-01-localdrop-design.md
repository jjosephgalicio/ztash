# LocalDrop — Design Spec

**Date:** 2026-05-01
**Status:** Approved (pending written-spec review)

## 1. Purpose

A self-hosted PWA for transferring screenshots, text snippets, links, and JSON between a laptop and a phone on the same WiFi network. Built to support a personal app-testing workflow where small bits of content (images, URLs, sample payloads) need to move between devices many times a day.

The app runs as a small Node.js server on the laptop. Both devices open it in a browser; either device can upload or paste an item, and it appears live on the other.

## 2. Goals & Non-Goals

**Goals**
- Transfer images, plain text, links, and JSON between two (or more) devices on the same LAN.
- Real-time delivery: an item posted on one device appears on the other within ~1 second.
- Persistent: items survive server restarts. Manual delete only.
- Mobile-first responsive UI that also works well on desktop.
- Installable as a PWA (Add to Home Screen) where the platform allows it.
- Compact, professional dark-first UI.
- Simple PIN gate so other devices on the same WiFi can't access the content.

**Non-Goals**
- Multi-user accounts, sharing, or per-user permissions.
- Cloud sync or cross-network access. Strictly LAN.
- End-to-end encryption beyond the PIN gate (LAN is assumed semi-trusted).
- Mobile-native apps. Browser/PWA only.
- Auto-cleanup of old items. Manual delete only.
- Offline editing. The PWA shell may load offline but item operations require the server.

## 3. Architecture Overview

```
┌─────────────────┐                ┌─────────────────┐
│  Phone browser  │ ◄── HTTP/SSE ──┤  Laptop server  │
│  (PWA client)   │                │  Node + SQLite  │
└─────────────────┘                └────────┬────────┘
                                            │
┌─────────────────┐                         │
│  Laptop browser │ ◄── HTTP/SSE ───────────┘
│  (PWA client)   │
└─────────────────┘
```

**Server runs on the laptop:**
- Node.js + Express
- Port `4123` (chosen to avoid conflict with another local project on `3000`)
- SQLite via `better-sqlite3` for item metadata
- `uploads/` directory on disk for binary content
- Server-Sent Events stream for real-time push to all connected clients
- PIN gate via httpOnly cookie session

**Client is a single PWA** served from the same origin. No separate dev server in production. Vite is used for the build pipeline only.

## 4. Tech Stack

**Server**
- `express` — HTTP routing
- `better-sqlite3` — synchronous SQLite, simple and fast at this scale
- `multer` — multipart upload handling
- `cookie-parser` — read the auth cookie
- `dotenv` — read PIN and config from `.env`
- Node ≥ 20

**Client**
- Vite (build only)
- Vanilla JavaScript (ES modules)
- Plain CSS with custom properties for theming
- No framework. The UI is a list of typed cards; a framework would add weight without payoff.
- Optional small libraries: a JSON syntax-highlight helper (~2 KB), nothing else

**Why no framework:** Bundle stays under ~30 KB gzipped, code is readable, and the rendering model (append/remove cards on SSE events) maps naturally to direct DOM ops.

## 5. Data Model

Single SQLite table:

```sql
CREATE TABLE items (
  id            TEXT PRIMARY KEY,           -- UUID v4
  type          TEXT NOT NULL,              -- 'image' | 'text' | 'link' | 'json'
  content       TEXT NOT NULL,              -- text body for text/link/json,
                                            -- stored filename (uuid.ext) for image
  mime          TEXT,                       -- e.g. 'image/png' for images, NULL otherwise
  size          INTEGER,                    -- bytes (file size for images,
                                            -- byte length of content for text-like)
  original_filename TEXT,                   -- original upload name, NULL for non-files
  link_title    TEXT,                       -- OG title for links, NULL otherwise
  created_at    INTEGER NOT NULL            -- unix ms
);
CREATE INDEX idx_items_created_at ON items(created_at DESC);
```

**Type detection on text submit (server-side):**
1. Trim input.
2. If matches `^https?://\S+$` → `link`. Server then attempts a best-effort fetch of OG `<title>` (with 3s timeout); on failure, `link_title` stays NULL.
3. Else if `JSON.parse` succeeds and the result is an object or array → `json`.
4. Else → `text`.

**File storage:** uploads land in `uploads/<uuid>.<ext>` where `<ext>` comes from the original filename's extension (sanitized to alphanumeric, defaults to `bin`).

## 6. API

All routes except `POST /api/auth` and the PWA shell require a valid `ld_session` cookie. Missing/invalid cookie returns 401.

| Method | Path | Body | Returns |
|---|---|---|---|
| `POST` | `/api/auth` | `{ pin: string }` | 200 + `Set-Cookie: ld_session=…` on match, 401 otherwise |
| `GET` | `/api/items` | — | `{ items: Item[], hasMore: boolean }` newest first, paginated by `?before=<ms>&limit=50` (default limit 50, max 200). Client uses a "Load more" button at the bottom of the feed when `hasMore` is true. |
| `POST` | `/api/items` | `{ content: string }` (JSON) **or** multipart with `file` field | 201 + the created `Item` |
| `DELETE` | `/api/items/:id` | — | 204 on success, 404 if not found |
| `GET` | `/api/uploads/:filename` | — | the file with correct `Content-Type` |
| `GET` | `/api/events` | — | SSE stream emitting `item:created` and `item:deleted` events |

**SSE event format:**
```
event: item:created
data: {...full Item...}

event: item:updated
data: {...full Item...}    // emitted when OG title is fetched for a link

event: item:deleted
data: {"id":"..."}

event: devices:changed
data: {"count": <int>}     // emitted when a client connects or disconnects
```

A newly-connected client receives a one-shot `devices:changed` event directly (so its UI shows the correct count immediately), then existing clients are notified via broadcast. After that, all clients receive every event.

The server keeps an in-memory `Set<Response>` of connected SSE clients and broadcasts to all on every mutation. Heartbeat comment line every 25 seconds to keep proxies/intermediaries from killing idle connections.

**Upload limit:** 50 MB per file (configurable via `.env: MAX_UPLOAD_MB`). Larger files return 413.

## 7. Authentication

- PIN is stored in `.env` as `PIN=123456` (4–6 digits, validated at startup).
- `POST /api/auth` compares submitted PIN with stored PIN using a constant-time compare.
- On match, server sets `ld_session=<random-32-byte-hex>` as `httpOnly`, `SameSite=Lax`, `Secure` only if served over HTTPS.
- The session token is also stored server-side in a `Set<string>` (in-memory). Restart invalidates all sessions — acceptable for a personal tool.
- Rate limit: 5 failed PIN attempts per IP within 60 seconds returns 429 with a 60-second lockout.
- No logout button in v1 (clear cookies in browser).

## 8. UI

### 8.1 Layout

Mobile-first, max content width 720px on desktop, centered.

```
┌─────────────────────────────────────────┐
│ ◉ LocalDrop          • 2 devices  ⋯    │  header
├─────────────────────────────────────────┤
│  ╔══════════════╗  ╔══════════════╗    │
│  ║  ⬆  Upload   ║  ║  ✎  Paste    ║    │  primary actions
│  ╚══════════════╝  ╚══════════════╝    │
├─────────────────────────────────────────┤
│  [All] Images Text Links JSON  ⊞ list   │  filters + view toggle
├─────────────────────────────────────────┤
│  ┌─ card (image / text / link / json)─┐│  feed, newest first
│  └────────────────────────────────────┘│
└─────────────────────────────────────────┘
```

- The two top buttons stay side-by-side down to ~360px viewport, then stack.
- Drag-and-drop is enabled on the entire page; an overlay appears when files are dragged in.
- The header shows a live device count (number of distinct SSE connections) and a small pulsing dot indicating SSE connection status (green = connected, gray = reconnecting).

### 8.2 Card types

- **Image card:** thumbnail (max-height 200px), filename, size, age, action row (`copy image` — copies the binary to clipboard via the Clipboard API where supported, falls back to copying the public URL `http://<lan-ip>:4123/api/uploads/<filename>`; `download`; `delete`). Click thumbnail → fullscreen lightbox; tap/click anywhere or press Esc to close.
- **Link card:** favicon (from `https://www.google.com/s2/favicons?domain=…`), URL, OG title (if available), action row (`copy`, `open`, `delete`).
- **JSON card:** syntax-highlighted, collapsed to first 4 lines with a `⌄` expand toggle. Action row (`copy`, `delete`).
- **Text card:** monospace, truncated to 4 lines with a `⌄` expand toggle if longer. Action row (`copy`, `delete`).

Every card shows its relative timestamp (e.g. "2m ago") which updates every 30 seconds.

### 8.3 Interactions

- **Upload button:** opens native file picker with `multiple` enabled. Picker is constrained with `accept="image/*"` so non-images are not selectable. Drag-drop also rejects non-image files with an error toast: "Only images can be uploaded — paste text, links, or JSON via the Paste button." (See O1.)
- **Paste button:** opens a slide-down composer panel containing a textarea, an auto-detected type badge that updates as the user types ("Detected: JSON" / "Link" / "Text"), a Send button, and a Cancel button. The badge runs the same detection logic as the server.
- **Global paste (`Ctrl/Cmd+V`):** when focus is not in an input — if the clipboard contains an image, upload it directly. If it contains text, open the composer pre-filled.
- **View toggle (`⊞`):** switches the feed between list view and a grid view (3 columns on desktop, 2 on mobile). Grid view shows only image cards; the "Images" filter chip is auto-activated when toggling to grid.
- **Filter chips:** click "All" or any type chip to filter. Multi-select is not supported; one filter at a time. The active chip is highlighted with the accent color.
- **Toasts:** every successful action ("Copied", "Deleted", "Uploaded") shows a 2-second toast at the bottom of the screen. Errors show a red toast that requires a click to dismiss.

### 8.4 Empty state

Centered illustration-free message: "No items yet. Drop a file or paste something to get started." with a subtle hint about `Ctrl/Cmd+V`.

### 8.5 PIN screen

Full-screen centered card on first visit. Six 1-digit input boxes (auto-advance on type, auto-submit on the 6th digit). "Remember this device" checkbox is checked by default. Failed attempt shakes the card and clears the inputs.

### 8.6 Visual style

- **Theme:** dark-first. Background `#0b0c10`, surface `#15171c`, border `#23262d`, text `#e6e8ea`, muted `#8a8f98`. Light theme toggle in the header menu uses inverted equivalents.
- **Accent:** muted indigo `#6366f1`. Used on primary buttons, active filter chip, focus rings, and the live-connection dot.
- **Type:** system font stack (`-apple-system, "Segoe UI", Inter, system-ui, sans-serif`). Body 14px, headings 16px.
- **Radius:** 8px on cards and buttons, 12px on the composer panel.
- **Spacing:** 12px between cards, 16px page padding, 8px inside cards.
- **Motion:** 150ms ease for hover, 200ms ease for composer slide-down, 250ms for lightbox fade. No bouncy animation.

## 9. PWA

- `manifest.json` with name "LocalDrop", short_name "LocalDrop", icon set (192/512), `display: standalone`, theme color matching the dark surface, start_url `/`.
- Service worker with cache-first for the app shell (HTML/JS/CSS/icons) and network-only for `/api/*`.
- Service worker version is the build hash; old caches are deleted on activate.
- iOS Safari constraint: PWA install requires HTTPS. Over plain HTTP on LAN, the page still works fully but Add-to-Home-Screen will be a regular bookmark, not a standalone PWA. Accepted limitation; documented in the README.

## 10. Project Structure

```
local-repo/
├── .env.example
├── .gitignore
├── package.json
├── README.md
├── docs/
│   └── superpowers/specs/2026-05-01-localdrop-design.md
├── server/
│   ├── index.js              # entry, prints LAN URL + PIN
│   ├── app.js                # express app wiring
│   ├── db.js                 # better-sqlite3 setup, prepared statements
│   ├── auth.js               # PIN check, session cookie, rate limit
│   ├── items.js              # CRUD + type detection + OG title fetch
│   ├── uploads.js            # multer config
│   ├── sse.js                # SSE broadcast hub
│   └── lan.js                # local IP discovery
├── client/
│   ├── index.html            # contains both PIN screen and main UI; client toggles which is visible based on auth state
│   ├── manifest.json
│   ├── sw.js                 # service worker
│   ├── icons/
│   └── src/
│       ├── main.js           # bootstraps app, fetch initial items, open SSE
│       ├── api.js            # fetch wrappers
│       ├── render.js         # render feed and per-card renderers
│       ├── composer.js       # paste composer + type detection
│       ├── upload.js         # file picker + drag-drop + clipboard image
│       ├── lightbox.js
│       ├── toast.js
│       └── style.css
├── uploads/                  # gitignored
└── data/
    └── localdrop.sqlite      # gitignored
```

## 11. Configuration (.env)

```
PIN=123456                # 4–6 digits, required
PORT=4123                 # default 4123
MAX_UPLOAD_MB=50          # default 50
DATA_DIR=./data           # SQLite + uploads parent
```

`.env.example` is committed; `.env` is gitignored.

## 12. Error Handling

- File over limit → 413 with JSON `{ error: "file_too_large", maxMb: 50 }`. Client toast: "File too large (max 50 MB)."
- Disk full / write error → 500 with generic message. Client toast: "Upload failed."
- OG fetch timeout/failure → silently store the link with `link_title = NULL`. Card shows the URL only.
- SSE disconnect → client auto-reconnects with exponential backoff (1s, 2s, 4s, capped at 30s). Header dot turns gray during reconnect.
- DB write conflict (extremely unlikely with single-writer SQLite) → 500 generic.
- Invalid type detection (impossible by construction) → falls through to `text`.

## 13. Testing Approach

- **Server unit tests** (vitest or node:test): type detection, PIN compare, OG title parse, file extension sanitization.
- **Server integration tests:** start app on a random port, exercise auth flow, item CRUD, SSE broadcast (open two clients, post on one, verify event on the other), upload size limit.
- **Client:** smoke-tested manually across desktop Chrome, mobile Safari, and mobile Chrome. No client unit test framework in v1 — the UI is too tightly coupled to direct DOM ops to be worth heavy testing investment for a personal tool.

## 14. Open Questions

These are minor and can be answered during implementation, but listing for transparency:

- **O1 — Non-image file uploads:** the spec lists card types image/text/link/json. If a user uploads a `.pdf` or `.zip`, it doesn't fit any card type. **Default for v1:** reject non-image uploads with an error toast ("Only images supported via upload — paste text/JSON/links instead"). The user can revisit later if they hit the limit.
- **O2 — Concurrent edit / dedup:** if the same image is uploaded twice it creates two items. Acceptable; no dedup in v1.
- **O3 — Image rotation/EXIF:** images are stored and served as-is. Browsers handle EXIF orientation natively for JPEG; not a concern.

## 15. Out of Scope (explicit non-goals revisited)

- Search across items
- Pinning / favorites
- Folders or tags
- Editing existing items
- Markdown rendering
- Drag-to-reorder
- Bulk select / bulk delete
- Export / archive
- Sharing items via URL outside the LAN

import { api } from './api.js';
import { toast } from './toast.js';
import { icon } from './icons.js';

const fmtBytes = (n) => {
  if (n == null) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
};

const relTime = (ms) => {
  const diff = Math.max(0, Date.now() - ms);
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

function highlightJson(s) {
  // Simple regex highlighter; safe because we replace inside textContent first.
  return s
    .replace(/"([^"\\]*(?:\\.[^"\\]*)*)"(\s*:)/g, '<span class="key">"$1"</span>$2')
    .replace(/:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/g, ': <span class="str">"$1"</span>')
    .replace(/:\s*(-?\d+(?:\.\d+)?)/g, ': <span class="num">$1</span>')
    .replace(/:\s*(true|false|null)/g, ': <span class="bool">$1</span>');
}

function escapeHtml(s) {
  return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

function favicon(url) {
  try {
    const u = new URL(url);
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(u.hostname)}&sz=32`;
  } catch {
    return '';
  }
}

// Legacy fallback for non-secure contexts (plain-HTTP LAN URLs).
// navigator.clipboard is only available on HTTPS or localhost, so copying
// over http://192.168.x.x silently fails without this.
function legacyCopy(s) {
  const ta = document.createElement('textarea');
  ta.value = s;
  ta.setAttribute('readonly', '');
  ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0';
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { ok = false; }
  document.body.removeChild(ta);
  return ok;
}

async function copyText(s) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(s);
      toast('Copied');
      return;
    } catch { /* secure-context check failed at runtime; fall through */ }
  }
  if (legacyCopy(s)) {
    toast('Copied');
    return;
  }
  toast('Copy failed', { error: true });
}

// Legacy image copy via contenteditable + execCommand('copy').
// On Chromium this *sometimes* writes real image bytes to the clipboard,
// but behavior varies by version — recent Chrome often only writes the
// outerHTML of the <img>, which Paint can't paste. Treat this as a best-
// effort attempt; the reliable fallback is the Open button.
async function legacyCopyImage(url) {
  const img = new Image();
  img.src = url;
  try {
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error('image_load_failed'));
    });
    if (img.decode) await img.decode().catch(() => {});
  } catch {
    return false;
  }
  const holder = document.createElement('div');
  holder.contentEditable = 'true';
  // Off-screen but keep dimensions and full opacity — selection / paint
  // paths in some browser versions skip elements with opacity:0.
  holder.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;overflow:hidden';
  holder.appendChild(img);
  document.body.appendChild(holder);
  const sel = window.getSelection();
  sel.removeAllRanges();
  const range = document.createRange();
  range.selectNodeContents(holder);
  sel.addRange(range);
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { ok = false; }
  sel.removeAllRanges();
  document.body.removeChild(holder);
  return ok;
}

async function copyImageOrUrl(item) {
  const url = `${location.origin}/api/uploads/${item.content}`;
  // 1. Modern Clipboard API — works on HTTPS / localhost only.
  if (navigator.clipboard?.write && window.ClipboardItem) {
    try {
      const blob = await fetch(url, { credentials: 'same-origin' }).then((r) => r.blob());
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
      toast('Image copied');
      return;
    } catch { /* secure-context blocked or failed; fall through */ }
  }
  // 2. Legacy execCommand path — best-effort; may copy bytes on older
  //    Chromium but often only HTML on current versions.
  if (await legacyCopyImage(url)) {
    toast('Image copied (paste into Paint may need Open → right-click instead)');
    return;
  }
  // 3. Last resort — copy the URL as text and tell the user how to get
  //    real image bytes.
  if (legacyCopy(url)) {
    toast('Copied URL. For Paint, click Open → right-click → Copy image.', { error: true });
    return;
  }
  toast('Copy failed', { error: true });
}

function actionRow(buttons) {
  const row = document.createElement('div');
  row.className = 'card-actions';
  for (const [label, fn, iconName] of buttons) {
    const b = document.createElement('button');
    b.className = 'btn';
    if (iconName) b.appendChild(icon(iconName, 14));
    b.appendChild(document.createTextNode(label));
    b.addEventListener('click', fn);
    row.appendChild(b);
  }
  return row;
}

async function deleteItem(item, card) {
  try {
    await api.deleteItem(item.id);
    card.remove();
    toast('Deleted');
  } catch {
    toast('Delete failed', { error: true });
  }
}

export function renderCard(item, ctx) {
  const card = document.createElement('article');
  card.className = `card ${item.type}`;
  card.dataset.id = item.id;
  card.dataset.type = item.type;
  card.dataset.createdAt = item.created_at;

  if (item.type === 'image') {
    const img = document.createElement('img');
    img.src = `/api/uploads/${item.content}`;
    img.alt = item.original_filename || '';
    img.addEventListener('click', () => ctx.lightbox.open(img.src));
    card.appendChild(img);

    const meta = document.createElement('div');
    meta.className = 'card-meta';
    meta.innerHTML = `<span>${escapeHtml(item.original_filename || '')}</span><span>${fmtBytes(item.size)} · ${relTime(item.created_at)}</span>`;
    card.appendChild(meta);

    card.appendChild(actionRow([
      ['Copy', () => copyImageOrUrl(item), 'copy'],
      ['Open', () => window.open(`/api/uploads/${item.content}`, '_blank', 'noopener'), 'external-link'],
      ['Download', () => { const a = document.createElement('a'); a.href = `/api/uploads/${item.content}`; a.download = item.original_filename || item.content; a.click(); }, 'download'],
      ['Delete', () => deleteItem(item, card), 'trash'],
    ]));
    return card;
  }

  if (item.type === 'link') {
    const row = document.createElement('div');
    row.className = 'link-row';
    const fav = favicon(item.content);
    if (fav) {
      const i = document.createElement('img');
      i.className = 'favicon'; i.src = fav; i.alt = '';
      // Google's favicon service can't reach LAN/private IPs and 404s.
      // Hide the broken-image icon rather than letting it render.
      i.addEventListener('error', () => i.remove());
      row.appendChild(i);
    }
    const text = document.createElement('div');
    text.innerHTML = `${item.link_title ? `<div class="title">${escapeHtml(item.link_title)}</div>` : ''}<div class="url">${escapeHtml(item.content)}</div>`;
    row.appendChild(text);
    card.appendChild(row);

    const meta = document.createElement('div');
    meta.className = 'card-meta';
    meta.innerHTML = `<span></span><span>${relTime(item.created_at)}</span>`;
    card.appendChild(meta);

    card.appendChild(actionRow([
      ['Copy', () => copyText(item.content), 'copy'],
      ['Open', () => window.open(item.content, '_blank', 'noopener'), 'external-link'],
      ['Delete', () => deleteItem(item, card), 'trash'],
    ]));
    return card;
  }

  if (item.type === 'json' || item.type === 'text') {
    const pre = document.createElement('pre');
    let formatted = item.content;
    if (item.type === 'json') {
      try { formatted = JSON.stringify(JSON.parse(item.content), null, 2); } catch { /* keep as-is */ }
      pre.innerHTML = highlightJson(escapeHtml(formatted));
    } else {
      pre.textContent = formatted;
    }
    pre.addEventListener('click', () => card.classList.toggle('expanded'));
    card.appendChild(pre);

    const meta = document.createElement('div');
    meta.className = 'card-meta';
    meta.innerHTML = `<span>${item.type === 'json' ? 'JSON' : 'Text'}</span><span>${fmtBytes(item.size)} · ${relTime(item.created_at)}</span>`;
    card.appendChild(meta);

    card.appendChild(actionRow([
      ['Copy', () => copyText(item.content), 'copy'],
      ['Delete', () => deleteItem(item, card), 'trash'],
    ]));
    return card;
  }

  return card;
}

export function setupTimestampRefresh() {
  setInterval(() => {
    document.querySelectorAll('.card').forEach((c) => {
      const ts = Number(c.dataset.createdAt);
      const span = c.querySelector('.card-meta span:last-child');
      if (!span) return;
      const text = span.textContent;
      // Replace the trailing "Xy ago" portion only
      span.textContent = text.replace(/[^·]*ago$/, relTime(ts));
    });
  }, 30_000);
}

import { api } from './api.js';
import { toast } from './toast.js';

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

async function copyText(s) {
  try {
    await navigator.clipboard.writeText(s);
    toast('Copied');
  } catch {
    toast('Copy failed', { error: true });
  }
}

async function copyImageOrUrl(item) {
  const url = `${location.origin}/api/uploads/${item.content}`;
  if (navigator.clipboard?.write && window.ClipboardItem) {
    try {
      const blob = await fetch(url, { credentials: 'same-origin' }).then((r) => r.blob());
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
      toast('Image copied');
      return;
    } catch { /* fall through */ }
  }
  await copyText(url);
}

function actionRow(buttons) {
  const row = document.createElement('div');
  row.className = 'card-actions';
  for (const [label, fn] of buttons) {
    const b = document.createElement('button');
    b.className = 'btn';
    b.textContent = label;
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
      ['Copy', () => copyImageOrUrl(item)],
      ['Download', () => { const a = document.createElement('a'); a.href = `/api/uploads/${item.content}`; a.download = item.original_filename || item.content; a.click(); }],
      ['Delete', () => deleteItem(item, card)],
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
      ['Copy', () => copyText(item.content)],
      ['Open', () => window.open(item.content, '_blank', 'noopener')],
      ['Delete', () => deleteItem(item, card)],
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
      ['Copy', () => copyText(item.content)],
      ['Delete', () => deleteItem(item, card)],
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

import { api } from './api.js';
import { toast } from './toast.js';

const URL_RE = /^https?:\/\/\S+$/;

function detect(s) {
  const trimmed = s.trim();
  if (URL_RE.test(trimmed)) return 'Link';
  try {
    const v = JSON.parse(trimmed);
    if (v !== null && typeof v === 'object') return 'JSON';
  } catch { /* */ }
  return 'Text';
}

export function setupComposer() {
  const panel = document.getElementById('composer');
  const text = document.getElementById('composer-text');
  const badge = document.getElementById('composer-badge');
  const cancel = document.getElementById('composer-cancel');
  const send = document.getElementById('composer-send');
  const openBtn = document.getElementById('btn-paste');

  function updateBadge() {
    badge.textContent = `Detected: ${detect(text.value)}`;
  }

  function open(prefill = '') {
    panel.hidden = false;
    text.value = prefill;
    updateBadge();
    text.focus();
  }
  function close() {
    panel.hidden = true;
    text.value = '';
  }

  openBtn.addEventListener('click', () => open());
  cancel.addEventListener('click', close);
  text.addEventListener('input', updateBadge);

  send.addEventListener('click', async () => {
    const value = text.value.trim();
    if (!value) return;
    try {
      await api.createItem(value);
      close();
    } catch (err) {
      toast(err.message || 'Send failed', { error: true });
    }
  });

  return { open, close };
}

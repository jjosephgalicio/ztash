import { setupPin } from './pin.js';
import { setupLightbox } from './lightbox.js';
import { setupComposer } from './composer.js';
import { setupUpload } from './upload.js';
import { setupFeed } from './feed.js';
import { setupTimestampRefresh } from './render.js';
import { applyIcons } from './icons.js';
import { api } from './api.js';

async function bootApp() {
  document.body.classList.remove('screen-pin');
  document.body.classList.add('screen-app');
  document.querySelector('.app').hidden = false;
  applyIcons(document.querySelector('.app'));

  const lightbox = setupLightbox();
  const feed = setupFeed({ lightbox });
  const composer = setupComposer();
  setupUpload({ composer });
  setupTimestampRefresh();

  await feed.initialLoad();
  feed.connectSse();
}

async function init() {
  // Probe auth: a 401 means we need PIN.
  try {
    await api.listItems({ limit: 1 });
    bootApp();
  } catch (e) {
    if (e.status === 401) {
      setupPin({ onUnlock: bootApp });
    } else {
      // Network error or other; show PIN screen anyway as a fallback.
      setupPin({ onUnlock: bootApp });
    }
  }
}

init();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => { /* ignore in dev */ });
  });
}

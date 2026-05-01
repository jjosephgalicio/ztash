import { api } from './api.js';
import { renderCard } from './render.js';
import { toast } from './toast.js';
import { icon } from './icons.js';

export function setupFeed({ lightbox }) {
  const feed = document.getElementById('feed');
  const chips = Array.from(document.querySelectorAll('#filter-chips .chip'));
  const viewToggle = document.getElementById('view-toggle');
  const loadMore = document.getElementById('load-more');
  const deviceCount = document.getElementById('device-count');
  const devicePlural = document.getElementById('device-plural');
  const connDot = document.getElementById('conn-dot');

  let currentFilter = 'all';
  let isGrid = false;
  let oldestLoaded = null;

  function applyFilter() {
    feed.querySelectorAll('.card').forEach((card) => {
      const t = card.dataset.type;
      card.style.display = (currentFilter === 'all' || currentFilter === t) ? '' : 'none';
    });
  }

  function prepend(item) {
    const card = renderCard(item, { lightbox });
    if (currentFilter !== 'all' && currentFilter !== item.type) card.style.display = 'none';
    if (feed.firstChild) feed.insertBefore(card, feed.firstChild); else feed.appendChild(card);
    updateEmpty();
  }

  function append(item) {
    const card = renderCard(item, { lightbox });
    if (currentFilter !== 'all' && currentFilter !== item.type) card.style.display = 'none';
    feed.appendChild(card);
    if (item.created_at < (oldestLoaded ?? Infinity)) oldestLoaded = item.created_at;
    updateEmpty();
  }

  function remove(id) {
    const card = feed.querySelector(`.card[data-id="${CSS.escape(id)}"]`);
    if (card) card.remove();
    updateEmpty();
  }

  function update(item) {
    const card = feed.querySelector(`.card[data-id="${CSS.escape(item.id)}"]`);
    if (!card) return;
    const replacement = renderCard(item, { lightbox });
    if (currentFilter !== 'all' && currentFilter !== item.type) replacement.style.display = 'none';
    card.replaceWith(replacement);
  }

  function updateEmpty() {
    const has = feed.querySelector('.card');
    let empty = feed.querySelector('.empty');
    if (!has && !empty) {
      empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = 'No items yet. Drop a file or paste something to get started.';
      feed.appendChild(empty);
    } else if (has && empty) {
      empty.remove();
    }
  }

  async function initialLoad() {
    try {
      const { items, hasMore } = await api.listItems({ limit: 50 });
      items.forEach(append);
      loadMore.hidden = !hasMore;
      updateEmpty();
    } catch (e) {
      toast('Failed to load items', { error: true });
    }
  }

  loadMore.addEventListener('click', async () => {
    try {
      const { items, hasMore } = await api.listItems({ before: oldestLoaded, limit: 50 });
      items.forEach(append);
      loadMore.hidden = !hasMore;
    } catch {
      toast('Failed to load more', { error: true });
    }
  });

  chips.forEach((chip) => {
    chip.addEventListener('click', () => {
      chips.forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      currentFilter = chip.dataset.filter;
      applyFilter();
    });
  });

  viewToggle.addEventListener('click', () => {
    isGrid = !isGrid;
    feed.classList.toggle('grid', isGrid);
    viewToggle.replaceChildren(icon(isGrid ? 'list' : 'layout-grid'));
    // Grid is a layout, not a filter — leave the active filter chip
    // alone so users can still scope to a single type if they want.
  });

  function connectSse() {
    const es = new EventSource('/api/events');
    // EventSource fires "error" on every transient retry, which is too
    // chatty to probe on. Wait until we've been disconnected for a few
    // seconds before checking whether our session is still valid; on a
    // 401 the server has been restarted (in-memory sessions wiped) and
    // we need to reload to show the PIN screen again.
    let probeTimer = null;
    const cancelProbe = () => {
      if (probeTimer) { clearTimeout(probeTimer); probeTimer = null; }
    };
    const scheduleProbe = () => {
      if (probeTimer) return;
      probeTimer = setTimeout(async () => {
        probeTimer = null;
        try {
          await api.listItems({ limit: 1 });
        } catch (err) {
          if (err.status === 401) {
            es.close();
            location.reload();
          }
        }
      }, 5000);
    };
    es.addEventListener('open', () => {
      connDot.classList.remove('disconnected');
      cancelProbe();
    });
    es.addEventListener('error', () => {
      connDot.classList.add('disconnected');
      scheduleProbe();
    });
    es.addEventListener('item:created', (e) => prepend(JSON.parse(e.data)));
    es.addEventListener('item:deleted', (e) => remove(JSON.parse(e.data).id));
    es.addEventListener('item:updated', (e) => update(JSON.parse(e.data)));
    es.addEventListener('devices:changed', (e) => {
      const { count } = JSON.parse(e.data);
      deviceCount.textContent = String(count);
      devicePlural.style.display = count === 1 ? 'none' : '';
    });
    return es;
  }

  return { initialLoad, connectSse };
}

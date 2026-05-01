export function setupLightbox() {
  const root = document.getElementById('lightbox');
  const img = document.getElementById('lightbox-img');
  function close() { root.hidden = true; img.src = ''; }
  root.addEventListener('click', close);
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  return {
    open(src) {
      img.src = src;
      root.hidden = false;
    },
  };
}

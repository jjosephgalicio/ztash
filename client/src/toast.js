const host = () => document.getElementById('toast-host');

export function toast(message, { error = false, duration = 2000 } = {}) {
  const el = document.createElement('div');
  el.className = `toast${error ? ' error' : ''}`;
  el.textContent = message;
  host().appendChild(el);
  if (!error) {
    setTimeout(() => el.remove(), duration);
  } else {
    el.style.cursor = 'pointer';
    el.addEventListener('click', () => el.remove(), { once: true });
  }
}

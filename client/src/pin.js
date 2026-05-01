import { api } from './api.js';
import { toast } from './toast.js';

export function setupPin({ onUnlock }) {
  const inputs = Array.from(document.querySelectorAll('#pin-inputs input'));
  const form = document.getElementById('pin-form');
  const card = document.querySelector('.pin-card');

  inputs.forEach((input, i) => {
    input.addEventListener('input', () => {
      input.value = input.value.replace(/\D/g, '').slice(0, 1);
      if (input.value && i < inputs.length - 1) inputs[i + 1].focus();
      if (i === inputs.length - 1 && input.value) form.requestSubmit();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !input.value && i > 0) inputs[i - 1].focus();
    });
  });

  function reset() {
    card.classList.add('shake');
    setTimeout(() => card.classList.remove('shake'), 300);
    inputs.forEach((i) => (i.value = ''));
    inputs[0].focus();
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const pin = inputs.map((i) => i.value).join('');
    if (pin.length < 4) return;
    try {
      await api.login(pin);
      onUnlock();
    } catch (err) {
      if (err.status === 401) {
        // Wrong PIN — silent shake, the box itself is the feedback.
        reset();
      } else if (err.status === 429) {
        toast('Too many attempts. Wait a minute and try again.', { error: true });
        reset();
      } else if (!err.status) {
        // Network error — fetch threw without a response. Server is gone.
        toast(
          "Can't reach Ztash. Is the server still running on your laptop? " +
          'Restart it with `npx @jjosephgalicio/ztash`.',
          { error: true }
        );
        reset();
      } else {
        toast(`Login failed (${err.status})`, { error: true });
        reset();
      }
    }
  });

  inputs[0]?.focus();
}

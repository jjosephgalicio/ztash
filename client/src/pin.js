import { api } from './api.js';

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

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const pin = inputs.map((i) => i.value).join('');
    if (pin.length < 4) return;
    try {
      await api.login(pin);
      onUnlock();
    } catch {
      card.classList.add('shake');
      setTimeout(() => card.classList.remove('shake'), 300);
      inputs.forEach((i) => (i.value = ''));
      inputs[0].focus();
    }
  });

  inputs[0]?.focus();
}

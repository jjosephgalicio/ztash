import { api } from './api.js';
import { toast } from './toast.js';

async function uploadAll(files) {
  for (const file of files) {
    if (!file.type.startsWith('image/')) {
      toast('Only images can be uploaded — paste text/links/JSON via the Paste button.', { error: true });
      continue;
    }
    try {
      await api.uploadFile(file);
    } catch (err) {
      if (err.data?.error === 'file_too_large') {
        toast(`File too large (max ${err.data.maxBytes / 1024 / 1024} MB)`, { error: true });
      } else {
        toast('Upload failed', { error: true });
      }
    }
  }
}

export function setupUpload({ composer }) {
  const fileInput = document.getElementById('file-input');
  const uploadBtn = document.getElementById('btn-upload');
  const dropzone = document.getElementById('dropzone');

  uploadBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    if (fileInput.files?.length) uploadAll(Array.from(fileInput.files));
    fileInput.value = '';
  });

  let depth = 0;
  window.addEventListener('dragenter', (e) => {
    if (!Array.from(e.dataTransfer?.types || []).includes('Files')) return;
    depth++;
    dropzone.classList.add('visible');
  });
  window.addEventListener('dragleave', () => {
    depth = Math.max(0, depth - 1);
    if (depth === 0) dropzone.classList.remove('visible');
  });
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    depth = 0;
    dropzone.classList.remove('visible');
    const files = Array.from(e.dataTransfer?.files || []);
    if (files.length) uploadAll(files);
  });

  // Global paste
  window.addEventListener('paste', (e) => {
    if (document.activeElement?.tagName === 'TEXTAREA' || document.activeElement?.tagName === 'INPUT') return;
    const items = Array.from(e.clipboardData?.items || []);
    const imageItem = items.find((i) => i.type.startsWith('image/'));
    if (imageItem) {
      const file = imageItem.getAsFile();
      if (file) uploadAll([file]);
      return;
    }
    const textData = e.clipboardData?.getData('text');
    if (textData) {
      e.preventDefault();
      composer.open(textData);
    }
  });
}

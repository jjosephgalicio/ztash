import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';

const SAFE_EXT_RE = /^\.[a-z0-9]+$/i;

export function createUploader({ uploadsDir, maxBytes }) {
  fs.mkdirSync(uploadsDir, { recursive: true });

  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsDir),
    filename: (_req, file, cb) => {
      const rawExt = path.extname(file.originalname).toLowerCase();
      const ext = SAFE_EXT_RE.test(rawExt) ? rawExt : '.bin';
      cb(null, `${randomUUID()}${ext}`);
    },
  });

  return multer({
    storage,
    limits: { fileSize: maxBytes },
    fileFilter: (_req, file, cb) => {
      if (!file.mimetype.startsWith('image/')) {
        cb(Object.assign(new Error('only_images'), { code: 'ONLY_IMAGES' }));
        return;
      }
      cb(null, true);
    },
  });
}

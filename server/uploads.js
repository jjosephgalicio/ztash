import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';

const SAFE_EXT_RE = /^\.[a-z0-9]+$/i;

// Explicit allowlist of binary image formats. SVG is intentionally
// excluded: SVG is XML and can carry <script> tags that execute in the
// page's same-origin context (with the auth cookie). Other niche formats
// like BMP/TIFF aren't useful for this app and are easier to deny than
// to vet.
const ALLOWED_MIMES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/avif',
]);

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
      if (!ALLOWED_MIMES.has(file.mimetype)) {
        cb(Object.assign(new Error('only_images'), { code: 'ONLY_IMAGES' }));
        return;
      }
      cb(null, true);
    },
  });
}

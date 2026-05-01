import express from 'express';
import cookieParser from 'cookie-parser';
import { createAuth } from './auth.js';
import { createItemsRouter } from './items.js';
import { createUploader } from './uploads.js';

export function createApp({ db, pin, uploadsDir, maxUploadBytes, broadcast = () => {}, sseHandler }) {
  const app = express();
  app.set('trust proxy', true);
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  const auth = createAuth({ pin });
  const items = createItemsRouter({ db, broadcast });
  const uploader = createUploader({ uploadsDir, maxBytes: maxUploadBytes });

  app.post('/api/auth', auth.loginHandler);
  app.get('/api/items', auth.requireAuth, items.list);
  app.delete('/api/items/:id', auth.requireAuth, items.remove);

  // POST /api/items — multipart goes to uploadHandler, JSON goes to create.
  app.post('/api/items', auth.requireAuth, (req, res, next) => {
    if ((req.headers['content-type'] || '').startsWith('multipart/')) {
      uploader.single('file')(req, res, (err) => {
        if (err) {
          if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(413).json({ error: 'file_too_large', maxBytes: maxUploadBytes });
          }
          if (err.code === 'ONLY_IMAGES') {
            return res.status(400).json({ error: 'only_images' });
          }
          return res.status(500).json({ error: 'upload_failed' });
        }
        items.uploadHandler(req, res);
      });
    } else {
      items.create(req, res, next);
    }
  });

  app.get('/api/uploads/:filename', auth.requireAuth, (req, res) => {
    const safe = req.params.filename.replace(/[^a-zA-Z0-9.-]/g, '');
    res.sendFile(safe, { root: uploadsDir }, (err) => {
      if (err) res.status(404).json({ error: 'not_found' });
    });
  });

  if (sseHandler) {
    app.get('/api/events', auth.requireAuth, sseHandler);
  }

  return app;
}

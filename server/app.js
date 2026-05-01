import express from 'express';
import cookieParser from 'cookie-parser';
import { createAuth } from './auth.js';
import { createItemsRouter } from './items.js';

export function createApp({ db, pin, uploadsDir, maxUploadBytes, broadcast }) {
  const app = express();
  app.set('trust proxy', true);
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  const auth = createAuth({ pin });
  const items = createItemsRouter({ db, broadcast });

  app.post('/api/auth', auth.loginHandler);
  app.get('/api/items', auth.requireAuth, items.list);
  app.post('/api/items', auth.requireAuth, items.create);
  app.delete('/api/items/:id', auth.requireAuth, items.remove);

  return app;
}

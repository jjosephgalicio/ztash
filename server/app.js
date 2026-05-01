import express from 'express';
import cookieParser from 'cookie-parser';
import { createAuth } from './auth.js';

export function createApp({ db, pin, uploadsDir, maxUploadBytes }) {
  const app = express();
  app.set('trust proxy', true);
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  const auth = createAuth({ pin });

  app.post('/api/auth', auth.loginHandler);

  // Items list — placeholder; full handler added in Task 6.
  app.get('/api/items', auth.requireAuth, (_req, res) => {
    res.json({ items: [], hasMore: false });
  });

  return app;
}

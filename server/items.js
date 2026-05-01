import { detectType } from './typeDetect.js';

export function createItemsRouter({ db, broadcast = () => {} }) {
  return {
    create(req, res) {
      const content = String(req.body?.content ?? '').trim();
      if (!content) return res.status(400).json({ error: 'empty_content' });
      const type = detectType(content);
      const item = db.items.insert({
        type,
        content,
        size: Buffer.byteLength(content, 'utf8'),
      });
      broadcast('item:created', item);
      res.status(201).json(item);
    },

    list(req, res) {
      const before = req.query.before ? Number(req.query.before) : undefined;
      const limit = req.query.limit ? Number(req.query.limit) : 50;
      res.json(db.items.list({ before, limit }));
    },

    remove(req, res) {
      const ok = db.items.remove(req.params.id);
      if (!ok) return res.status(404).json({ error: 'not_found' });
      broadcast('item:deleted', { id: req.params.id });
      res.status(204).end();
    },

    uploadHandler(req, res) {
      if (!req.file) return res.status(400).json({ error: 'no_file' });
      const item = db.items.insert({
        type: 'image',
        content: req.file.filename,
        mime: req.file.mimetype,
        size: req.file.size,
        original_filename: req.file.originalname,
      });
      broadcast('item:created', item);
      res.status(201).json(item);
    },
  };
}

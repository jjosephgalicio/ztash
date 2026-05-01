const HEARTBEAT_MS = 25_000;

export function createSseHub() {
  const clients = new Set();

  function broadcast(event, data) {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of clients) {
      try { res.write(payload); } catch { /* will be cleaned up on close */ }
    }
  }

  function handler(req, res) {
    res.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();
    res.write(': connected\n\n');

    broadcast('devices:changed', { count: clients.size + 1 });
    clients.add(res);

    const heartbeat = setInterval(() => {
      try { res.write(': hb\n\n'); } catch { /* ignore */ }
    }, HEARTBEAT_MS);

    req.on('close', () => {
      clearInterval(heartbeat);
      clients.delete(res);
      broadcast('devices:changed', { count: clients.size });
    });
  }

  return {
    handler,
    broadcast,
    size: () => clients.size,
  };
}

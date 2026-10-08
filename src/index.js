import dotenv from 'dotenv';
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import scanHandler from '../api/scan.js';
import telegramHandler from '../api/telegram.js';
dotenv.config({ quiet: true });
export function createLocalServer() {
  return createServer(async (req, res) => {
    res.status = (status) => { res.statusCode = status; return res; };
    res.json = (body) => { res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(body)); return res; };
    const path = new URL(req.url, 'http://localhost').pathname;
    try {
      if (path === '/') return res.status(200).json({ service: 'Trading Pattern Alert Bot', status: 'ready' });
      if (path === '/api/scan') return await scanHandler(req, res);
      if (path === '/api/telegram') {
        if (req.method === 'POST') {
          const chunks = []; let size = 0;
          for await (const chunk of req) {
            size += chunk.length;
            if (size > 16384) return res.status(413).json({ error: 'Payload too large' });
            chunks.push(chunk);
          }
          req.body = Buffer.concat(chunks).toString('utf8');
        }
        return await telegramHandler(req, res);
      }
      return res.status(404).json({ error: 'Not found' });
    } catch {
      return res.status(500).json({ error: 'Request failed' });
    }
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT inválido');
  const server = createLocalServer();
  server.listen(port, '127.0.0.1', () => console.info(`Servidor local: http://127.0.0.1:${port}; scanner ejecutado solo por petición`));
  server.on('error', () => { console.error('No se pudo iniciar el servidor local'); process.exitCode = 1; });
}

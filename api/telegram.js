import { secretMatches, respond } from '../src/utils/http.js';
export default async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return respond(res, 405, { error: 'Method not allowed' }); }
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret || !/^[A-Za-z0-9_-]{16,256}$/.test(secret)) return respond(res, 503, { error: 'Service not configured' });
  if (!secretMatches(req.headers['x-telegram-bot-api-secret-token'], secret)) {
    console.warn('Unauthorized Telegram webhook request');
    return respond(res, 401, { error: 'Unauthorized' });
  }
  let body = req.body;
  try { if (typeof body === 'string') body = JSON.parse(body); } catch { return respond(res, 400, { error: 'Invalid update' }); }
  if (!body || !Number.isSafeInteger(body.update_id) || body.update_id < 0
    || (body.message && (!Number.isSafeInteger(body.message.chat?.id)
      || !Number.isSafeInteger(body.message.date) || body.message.date <= 0
      || !Number.isSafeInteger(body.message.from?.id)
      || (body.message.text !== undefined && (typeof body.message.text !== 'string' || body.message.text.length > 4096))))) {
    return respond(res, 400, { error: 'Invalid update' });
  }
  try {
    const { processUpdate } = await import('../src/services/commands.js');
    await processUpdate(body);
    return respond(res, 200, { ok: true });
  } catch {
    console.error('Telegram update failed; check configuration, Telegram and storage');
    return respond(res, 503, { error: 'Webhook unavailable' });
  }
}

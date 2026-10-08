import { telegramRequest } from '../src/services/telegram.js';
try {
  const info = await telegramRequest('getWebhookInfo', {});
  console.info(JSON.stringify({ configured: Boolean(info.url), pendingUpdates: info.pending_update_count,
    hasDeliveryError: Boolean(info.last_error_date), lastErrorDate: info.last_error_date ?? null,
    maxConnections: info.max_connections }, null, 2));
} catch { console.error('No se pudo consultar el webhook. Revisa el token.'); process.exitCode = 1; }

import config from '../src/config.js';
import { telegramRequest } from '../src/services/telegram.js';
try {
  const url = new URL(process.env.DEPLOYMENT_URL ?? '');
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('URL inválida');
  if (!/^[A-Za-z0-9_-]{16,256}$/.test(config.telegram.webhookSecret)) throw new Error('Secret inválido');
  if (!/^-?\d+$/.test(config.telegram.chatId)) throw new Error('Chat ID inválido');
  await telegramRequest('setWebhook', { url: new URL('/api/telegram', url).href,
    secret_token: config.telegram.webhookSecret, allowed_updates: ['message'], max_connections: 1, drop_pending_updates: false });
  console.info('Webhook registrado. Comprueba npm run telegram:info y envía /status.');
} catch {
  console.error('No se pudo registrar el webhook. Revisa DEPLOYMENT_URL (HTTPS), TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID y TELEGRAM_WEBHOOK_SECRET.');
  process.exitCode = 1;
}

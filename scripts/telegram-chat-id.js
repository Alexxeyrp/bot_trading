import { telegramRequest } from '../src/services/telegram.js';
try {
  const updates = await telegramRequest('getUpdates', { limit: 10, timeout: 0, allowed_updates: ['message'] });
  const chats = updates.filter((u) => u.message).map((u) => ({ chatId: u.message.chat.id, userId: u.message.from?.id, type: u.message.chat.type }));
  console.info(JSON.stringify(chats, null, 2));
  if (!chats.length) console.info('Envía primero /start al bot y repite. Utiliza este script antes de registrar el webhook.');
} catch { console.error('No se pudo obtener el chat ID. Revisa el token y que todavía no exista un webhook.'); process.exitCode = 1; }

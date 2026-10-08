import config from '../config.js';
export async function telegramRequest(method, body, telegram = config.telegram) {
  if (!telegram.botToken) throw new Error('Falta TELEGRAM_BOT_TOKEN');
  let response, data;
  try {
    response = await fetch(`https://api.telegram.org/bot${telegram.botToken}/${method}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(8000) });
    data = await response.json();
  } catch {
    const error = new Error('Telegram: fallo de red o respuesta inválida; entrega incierta');
    error.deliveryUncertain = true;
    throw error;
  }
  if (!response.ok || data.ok !== true) {
    const error = new Error(`Telegram rechazó la petición (HTTP ${response.status})`);
    error.deliveryUncertain = response.status >= 500;
    throw error;
  }
  return data.result;
}
export async function sendMessage(text) {
  if (typeof text !== 'string' || !text.trim() || text.length > 4096) throw new Error('Mensaje Telegram inválido');
  if (!/^-?\d+$/.test(config.telegram.chatId)) throw new Error('Falta TELEGRAM_CHAT_ID válido');
  return telegramRequest('sendMessage', { chat_id: config.telegram.chatId, text });
}

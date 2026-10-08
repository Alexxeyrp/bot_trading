import config, { PATTERNS, INTERVALS, validateSymbol, validateTimeframe } from '../config.js';
import logger from '../utils/logger.js';
import { storage } from './storage.js';
import { sendMessage } from './telegram.js';
export function isAuthorized(message, chatId = config.telegram.chatId) {
  if (!/^-?\d+$/.test(String(chatId))) return false;
  if (String(message?.chat?.id) !== String(chatId) || message?.from?.is_bot || !message?.from?.id || message.sender_chat) return false;
  // Un grupo requiere además un administrador individual explícito.
  return String(chatId).startsWith('-') ? String(message.from.id) === String(process.env.TELEGRAM_ADMIN_USER_ID ?? '') : String(message.from.id) === String(chatId);
}
export const HELP = [
  '🤖 Trading Pattern Bot — análisis y alertas',
  '/start, /help — ayuda', '/status — estado y estadísticas', '/run — activar (próximo Cron)', '/stop — desactivar',
  '/symbol BTCUSDT — cambiar activo', '/timeframe 5m — cambiar temporalidad', '/confidence 80 — umbral 0–100',
  '/patterns — ver patrones', '/enable doublebottom — activar patrón', '/disable doublebottom — desactivar patrón',
  'Patrones: doublebottom, doubletop, ascendingtriangle.',
  'Vercel Hobby: un análisis diario. /run no inicia un proceso permanente.',
].join('\n');
function patternText(settings) {
  return Object.entries(PATTERNS).map(([id, name]) => `${settings.patterns[id] ? '✅' : '❌'} ${name}`).join('\n');
}
export async function commandReply(text, updateId, store = storage, provider = config.dataProvider, messageDate = 0) {
  const [raw, ...args] = text.trim().split(/\s+/);
  const command = raw.split('@')[0].toLowerCase();
  const noArgs = ['/start', '/help', '/status', '/run', '/stop', '/patterns'];
  if (noArgs.includes(command) && args.length) return 'Este comando no admite argumentos. Usa /help.';
  if (['/start', '/help'].includes(command)) return HELP;
  if (command === '/status' || command === '/patterns') {
    const settings = await store.getSettings();
    if (command === '/patterns') return patternText(settings);
    const stats = await store.getStats();
    return ['🤖 Trading Pattern Bot', '', `Estado: ${settings.active ? '🟢 ACTIVO' : '🔴 INACTIVO'}`, '',
      `Activo: ${settings.symbol}`, `Temporalidad: ${settings.timeframe}`, `Confianza mínima: ${settings.minConfidence}%`,
      '', 'Patrones:', patternText(settings), '', `Análisis: ${stats.scans} · Alertas: ${stats.alertsSent} · Errores: ${stats.errors}`,
      `Último análisis: ${stats.lastScan?.at ?? 'ninguno'}`, `Última alerta: ${stats.lastAlert?.sentAt ?? 'ninguna'}`,
      'Cron Hobby: diario (UTC).'].join('\n');
  }
  let field, value;
  try {
    if (command === '/run' || command === '/stop') { field = 'active'; value = command === '/run'; }
    else {
      if (!['/symbol', '/timeframe', '/confidence', '/enable', '/disable'].includes(command)) return 'Comando desconocido. Usa /help.';
      if (args.length !== 1) return 'Debes indicar un único argumento. Usa /help.';
      if (command === '/symbol') { field = 'symbol'; value = validateSymbol(args[0], provider); }
      if (command === '/timeframe') { field = 'timeframe'; value = validateTimeframe(args[0], provider); }
      if (command === '/confidence') {
        if (!/^\d{1,3}$/.test(args[0]) || Number(args[0]) > 100) throw new Error('La confianza debe ser un entero entre 0 y 100');
        field = 'minConfidence'; value = Number(args[0]);
      }
      if (command === '/enable' || command === '/disable') {
        const id = args[0].toLowerCase();
        if (!Object.hasOwn(PATTERNS, id)) throw new Error('Patrón desconocido');
        field = `pattern:${id}`; value = command === '/enable';
      }
    }
  } catch {
    return `Argumento inválido. Confianza: 0–100. Temporalidades: ${INTERVALS[provider].join(', ')}. Usa /help.`;
  }
  const applied = await store.setSetting(field, value, updateId, messageDate);
  logger.info(`Cambio de configuración: ${field}; aplicado=${applied}`);
  if (!applied) return 'Comando antiguo o ya aplicado; se conserva la configuración más reciente.';
  if (field === 'active') return value ? '🟢 Scanner activo. El próximo Cron realizará el análisis.' : '🔴 Scanner desactivado.';
  return `Configuración guardada: ${field} = ${value}. El proveedor comprobará la disponibilidad del activo durante el análisis.`;
}
export async function processUpdate(update, { store = storage, send = sendMessage, authorize = isAuthorized } = {}) {
  const message = update.message;
  if (!message || typeof message.text !== 'string' || !message.text.startsWith('/')) return { status: 'ignored' };
  if (!authorize(message)) {
    logger.warn('Intento de comando Telegram no autorizado');
    return { status: 'unauthorized' };
  }
  const name = `update:${update.update_id}`;
  const token = await store.claim(name, 120);
  if (!token) {
    if (await store.claimState(name) === 'done') return { status: 'duplicate' };
    throw new Error('Update todavía en proceso; Telegram debe reintentar');
  }
  try {
    const command = message.text.split(/\s/)[0].split('@')[0].toLowerCase();
    const known = /^\/(start|help|status|run|stop|symbol|timeframe|confidence|patterns|enable|disable)$/.test(command);
    logger.info(`Comando Telegram recibido: ${known ? command : 'desconocido'}`);
    await send(await commandReply(message.text, update.update_id, store, config.dataProvider, message.date));
    if (!await store.complete(name, token)) throw new Error('Reserva del update caducada');
    return { status: 'processed' };
  } catch {
    await store.release(name, token);
    throw new Error('No se pudo procesar el comando Telegram');
  }
}

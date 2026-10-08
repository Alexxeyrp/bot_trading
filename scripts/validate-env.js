import config from '../src/config.js';
const problems = [];
if (!config.telegram.botToken) problems.push('TELEGRAM_BOT_TOKEN');
if (!/^-?\d+$/.test(config.telegram.chatId)) problems.push('TELEGRAM_CHAT_ID (numérico)');
if (config.telegram.chatId.startsWith('-') && !/^\d+$/.test(process.env.TELEGRAM_ADMIN_USER_ID ?? '')) problems.push('TELEGRAM_ADMIN_USER_ID (para grupos)');
if (!/^[A-Za-z0-9_-]{16,256}$/.test(config.telegram.webhookSecret)) problems.push('TELEGRAM_WEBHOOK_SECRET (16–256 caracteres permitidos)');
if (config.cronSecret.length < 16) problems.push('CRON_SECRET (mínimo 16 caracteres)');
if (!config.storage.url.startsWith('https://')) problems.push('UPSTASH_REDIS_REST_URL (HTTPS)');
if (!config.storage.token) problems.push('UPSTASH_REDIS_REST_TOKEN (token de escritura)');
if (!/^[A-Za-z0-9:_-]{1,80}$/.test(config.storage.prefix)) problems.push('STORAGE_PREFIX');
if (config.dataProvider === 'twelvedata' && !config.marketData.apiKey) problems.push('MARKET_DATA_API_KEY');
if (problems.length) { console.error('Faltan valores o son inválidos: ' + problems.join(', ')); process.exitCode = 1; }
else console.info('Configuración de producción válida. Todavía debes comprobar conectividad y deployment.');

import dotenv from 'dotenv';
dotenv.config({ quiet: true });
export const PATTERNS = Object.freeze({ doublebottom: 'Double Bottom', doubletop: 'Double Top', ascendingtriangle: 'Ascending Triangle' });
export const INTERVALS = Object.freeze({
  binance: ['1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '6h', '8h', '12h', '1d', '3d', '1w', '1M'],
  twelvedata: ['1m', '5m', '15m', '30m', '45m', '1h', '2h', '4h', '8h', '1d', '1w', '1M'],
});
function number(value, fallback, name, min, max, integer = true) {
  const result = Number(value ?? fallback);
  if (value === '' || !Number.isFinite(result) || (integer && !Number.isInteger(result)) || result < min || result > max) throw new Error(`Configuración inválida: ${name}`);
  return result;
}
function boolean(value, fallback, name) {
  if (value === undefined) return fallback;
  if (['true', '1'].includes(String(value))) return true;
  if (['false', '0'].includes(String(value))) return false;
  throw new Error(`Configuración inválida: ${name}`);
}
export function validateSymbol(value, provider) {
  if (typeof value !== 'string') throw new Error('Símbolo inválido');
  const symbol = value.trim().toUpperCase();
  const valid = provider === 'binance' ? /^[A-Z0-9]{5,20}$/ : /^[A-Z]{3}\/?[A-Z]{3}$/;
  if (!valid.test(symbol)) throw new Error('Símbolo inválido para el proveedor');
  return symbol;
}
export function validateTimeframe(value, provider) {
  if (!Object.hasOwn(INTERVALS, provider) || !INTERVALS[provider].includes(value)) throw new Error('Temporalidad no soportada');
  return value;
}
export function validateSettings(settings, provider) {
  if (!settings || typeof settings.active !== 'boolean') throw new Error('Estado del scanner inválido');
  const result = { ...settings, symbol: validateSymbol(settings.symbol, provider), timeframe: validateTimeframe(settings.timeframe, provider),
    minConfidence: number(settings.minConfidence, 75, 'MIN_CONFIDENCE', 0, 100) };
  if (!settings.patterns || Object.keys(settings.patterns).length !== Object.keys(PATTERNS).length
    || !Object.keys(PATTERNS).every((id) => typeof settings.patterns[id] === 'boolean')) throw new Error('Patrones inválidos');
  return result;
}
export function loadConfig(env = process.env) {
  const dataProvider = (env.DATA_PROVIDER ?? 'binance').toLowerCase();
  if (!Object.hasOwn(INTERVALS, dataProvider)) throw new Error('DATA_PROVIDER no soportado');
  const minCandles = number(env.MIN_CANDLES, 50, 'MIN_CANDLES', 10, 999);
  const candleLimit = number(env.CANDLE_LIMIT, 200, 'CANDLE_LIMIT', minCandles + 1, 1000);
  const enabled = (env.ENABLED_PATTERNS ?? Object.keys(PATTERNS).join(',')).split(',').filter(Boolean);
  if (enabled.some((id) => !Object.hasOwn(PATTERNS, id))) throw new Error('ENABLED_PATTERNS inválido');
  const defaults = validateSettings({ active: boolean(env.SCANNER_ACTIVE, false, 'SCANNER_ACTIVE'), symbol: env.SYMBOL ?? 'BTCUSDT',
    timeframe: env.TIMEFRAME ?? '5m', minConfidence: number(env.MIN_CONFIDENCE, 75, 'MIN_CONFIDENCE', 0, 100),
    patterns: Object.fromEntries(Object.keys(PATTERNS).map((id) => [id, enabled.includes(id)])) }, dataProvider);
  const apiUrl = env.MARKET_DATA_API_URL || (dataProvider === 'binance' ? 'https://api.binance.com' : 'https://api.twelvedata.com');
  if (new URL(apiUrl).protocol !== 'https:') throw new Error('MARKET_DATA_API_URL debe usar HTTPS');
  return Object.freeze({
    ...defaults, defaults, dataProvider, minCandles, candleLimit,
    doubleBottomTolerance: number(env.DOUBLE_BOTTOM_TOLERANCE, 0.02, 'DOUBLE_BOTTOM_TOLERANCE', 0, 1, false),
    doubleTopTolerance: number(env.DOUBLE_TOP_TOLERANCE, 0.02, 'DOUBLE_TOP_TOLERANCE', 0, 1, false),
    triangleTolerance: number(env.TRIANGLE_TOLERANCE, 0.02, 'TRIANGLE_TOLERANCE', 0, 1, false),
    breakoutConfirmationPercent: number(env.BREAKOUT_CONFIRMATION_PERCENT, 0.001, 'BREAKOUT_CONFIRMATION_PERCENT', 0, 1, false),
    minPatternSeparation: number(env.MIN_PATTERN_SEPARATION, 5, 'MIN_PATTERN_SEPARATION', 2, 100),
    pivotWindow: number(env.PIVOT_WINDOW, 2, 'PIVOT_WINDOW', 1, 20),
    cooldownSeconds: number(env.ALERT_COOLDOWN_SECONDS, 3600, 'ALERT_COOLDOWN_SECONDS', 1, 86400),
    maxSignalAgeCandles: number(env.MAX_SIGNAL_AGE_CANDLES, 2, 'MAX_SIGNAL_AGE_CANDLES', 1, 100),
    signalRetentionSeconds: 90 * 86400, debugPatterns: boolean(env.DEBUG_PATTERNS, false, 'DEBUG_PATTERNS'),
    logLevel: ['error', 'warn', 'info', 'debug'].includes(env.LOG_LEVEL) ? env.LOG_LEVEL : 'info',
    cronSecret: env.CRON_SECRET ?? '',
    telegram: { botToken: env.TELEGRAM_BOT_TOKEN ?? '', chatId: env.TELEGRAM_CHAT_ID ?? '', webhookSecret: env.TELEGRAM_WEBHOOK_SECRET ?? '' },
    storage: { url: env.UPSTASH_REDIS_REST_URL ?? '', token: env.UPSTASH_REDIS_REST_TOKEN ?? '', prefix: env.STORAGE_PREFIX ?? 'trading-bot' },
    marketData: { apiUrl: apiUrl.replace(/\/+$/, ''), apiKey: env.MARKET_DATA_API_KEY ?? '' },
  });
}
export default loadConfig();

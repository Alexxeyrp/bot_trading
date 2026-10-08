import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
const files = readdirSync('tests').filter((name) => name.endsWith('.test.js')).map((name) => `tests/${name}`);
const env = { ...process.env, NODE_ENV: 'test', LOG_LEVEL: 'error', DATA_PROVIDER: 'binance', SYMBOL: 'BTCUSDT',
  TIMEFRAME: '5m', MIN_CONFIDENCE: '75', MIN_CANDLES: '50', CANDLE_LIMIT: '200', PIVOT_WINDOW: '2',
  MIN_PATTERN_SEPARATION: '5', DOUBLE_BOTTOM_TOLERANCE: '0.02', DOUBLE_TOP_TOLERANCE: '0.02', TRIANGLE_TOLERANCE: '0.02',
  BREAKOUT_CONFIRMATION_PERCENT: '0.001', SCANNER_ACTIVE: 'false', DEBUG_PATTERNS: 'false', ALERT_COOLDOWN_SECONDS: '3600',
  ENABLED_PATTERNS: 'doublebottom,doubletop,ascendingtriangle', MARKET_DATA_API_URL: 'https://api.binance.com', MARKET_DATA_API_KEY: '',
  TELEGRAM_BOT_TOKEN: 'test-token', TELEGRAM_CHAT_ID: '12345', TELEGRAM_ADMIN_USER_ID: '12345',
  TELEGRAM_WEBHOOK_SECRET: 'test-webhook-secret-012345', CRON_SECRET: 'test-cron-secret-012345',
  UPSTASH_REDIS_REST_URL: 'https://test.invalid', UPSTASH_REDIS_REST_TOKEN: 'test-redis-token', STORAGE_PREFIX: 'tests' };
const result = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit', env });
process.exitCode = result.status ?? 1;

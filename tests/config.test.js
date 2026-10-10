import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig, validateSymbol, validateSettings } from '../src/config.js';
test('Defaults seguros y proveedores compatibles', () => {
  const config = loadConfig({});
  assert.equal(config.defaults.active, false); assert.equal(config.minConfidence, 75);
  assert.equal(config.timeframe, '5m'); assert.equal(config.dataProvider, 'binance');
  assert.equal(config.maxSignalAgeCandles, 2);
  assert.equal(loadConfig({ MAX_SIGNAL_AGE_CANDLES: '1' }).maxSignalAgeCandles, 1);
  assert.equal(validateSymbol('btcusdt', 'binance'), 'BTCUSDT');
  assert.equal(loadConfig({ DATA_PROVIDER: 'twelvedata', SYMBOL: 'EURUSD' }).symbol, 'EURUSD');
});
test('Configuración rechaza valores inválidos', () => {
  for (const env of [
    { MIN_CONFIDENCE: '-1' }, { MIN_CONFIDENCE: '101' }, { MIN_CONFIDENCE: '' }, { MIN_CANDLES: 'NaN' },
    { CANDLE_LIMIT: '40' }, { CANDLE_LIMIT: '1001' }, { TIMEFRAME: '2m' }, { SYMBOL: '../bad' },
    { DATA_PROVIDER: 'unknown' }, { DATA_PROVIDER: 'twelvedata', SYMBOL: 'BTCUSDT' },
    { SCANNER_ACTIVE: 'maybe' }, { ENABLED_PATTERNS: 'constructor' }, { DOUBLE_TOP_TOLERANCE: '1.1' },
    { MARKET_DATA_API_URL: 'http://example.com' }, { MIN_PATTERN_SEPARATION: '1' },
    { MAX_SIGNAL_AGE_CANDLES: '0' }, { MAX_SIGNAL_AGE_CANDLES: '101' }, { MAX_SIGNAL_AGE_CANDLES: '1.5' }, { MAX_SIGNAL_AGE_CANDLES: '' },
  ]) assert.throws(() => loadConfig(env), JSON.stringify(env));
  assert.throws(() => validateSettings({ ...loadConfig({}).defaults, patterns: {} }, 'binance'));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import scanHandler from '../api/scan.js';
import telegramHandler from '../api/telegram.js';
import { createLocalServer } from '../src/index.js';
import { getCandles as binance } from '../src/marketData/binance.js';
import { getCandles as twelveData } from '../src/marketData/twelveData.js';
import { normalizeCandles } from '../src/marketData/normalize.js';
import { candleCloseTime } from '../src/marketData/helpers.js';
import { telegramRequest } from '../src/services/telegram.js';
import { secretMatches } from '../src/utils/http.js';
import { redisFixture } from './redis-fixture.js';
function response() {
  return { headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
}
test('Endpoints: métodos, secretos y validación de updates', async () => {
  for (const [handler, method, header, secret] of [
    [scanHandler, 'GET', 'authorization', `Bearer ${process.env.CRON_SECRET}`],
    [telegramHandler, 'POST', 'x-telegram-bot-api-secret-token', process.env.TELEGRAM_WEBHOOK_SECRET],
  ]) {
    const wrongMethod = response(); await handler({ method: 'PUT', headers: {} }, wrongMethod); assert.equal(wrongMethod.code, 405);
    const unauthorized = response(); await handler({ method, headers: { [header]: 'bad' } }, unauthorized); assert.equal(unauthorized.code, 401);
    assert.equal(unauthorized.headers['Cache-Control'], 'no-store');
    if (method === 'POST') {
      for (const body of ['{broken', { update_id: -1 }, { update_id: 1, message: { chat: { id: 1 }, text: '/run' } }]) {
        const invalid = response(); await handler({ method, headers: { [header]: secret }, body }, invalid); assert.equal(invalid.code, 400);
      }
    }
  }
  assert.equal(secretMatches('token', ''), false); assert.equal(secretMatches('token', 'tokens'), false);
});
test('Webhook HTTP: no autorizado se reconoce sin tocar servicios', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('No external services allowed'); });
  const res = response();
  await telegramHandler({ method: 'POST', headers: { 'x-telegram-bot-api-secret-token': process.env.TELEGRAM_WEBHOOK_SECRET },
    body: { update_id: 1, message: { chat: { id: 99 }, from: { id: 99 }, date: 1700000000, text: '/run' } } }, res);
  assert.equal(res.code, 200); assert.deepEqual(res.body, { ok: true });
});
test('HTTP integrado: webhook modifica Redis y Cron respeta /stop', async (t) => {
  const fixture = await redisFixture(t); let replies = 0;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (String(url).startsWith('https://test.invalid')) return Response.json(await fixture.transport(url, options));
    if (String(url).startsWith('https://api.telegram.org')) { replies++; return Response.json({ ok: true, result: { message_id: 1 } }); }
    throw new Error('Unexpected external service');
  });
  const stopped = response();
  await telegramHandler({ method: 'POST', headers: { 'x-telegram-bot-api-secret-token': process.env.TELEGRAM_WEBHOOK_SECRET },
    body: { update_id: 20, message: { chat: { id: 12345 }, from: { id: 12345 }, date: 1700000000, text: '/stop' } } }, stopped);
  assert.equal(stopped.code, 200); assert.equal(replies, 1);
  const scan = response();
  await scanHandler({ method: 'GET', headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } }, scan);
  assert.equal(scan.code, 200); assert.equal(scan.body.status, 'inactive');
});
test('Servidor local arranca y protege ambas rutas', async (t) => {
  const server = createLocalServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }));
  const url = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(url)).status, 200);
  assert.equal((await fetch(`${url}/api/scan`)).status, 401);
  assert.equal((await fetch(`${url}/api/telegram`, { method: 'POST', body: '{}' })).status, 401);
});
test('Binance: OHLC normalizado y vela abierta excluida', async (t) => {
  const rows = [[1700000000000,'100','101','99','100','0',1700000299999],
    [1700000300000,'100','101','99','100','0',1700000599999]];
  t.mock.method(globalThis, 'fetch', async (url) => {
    assert.equal(new URL(url).pathname, '/api/v3/klines');
    return Response.json(rows);
  });
  const candles = await binance({ symbol: 'BTCUSDT', timeframe: '5m' }, 1700000400000);
  assert.equal(candles.length, 1); assert.equal(candles[0].timestamp, 1700000000);
  assert.equal(candles[0].closeTimestamp, 1700000300);
});
test('Proveedor: HTTP, timeout y datos inválidos fallan de forma segura', async (t) => {
  for (const fn of [async () => new Response('bad', { status: 429 }), async () => Response.json({ bad: true }),
    async () => { throw new Error('timeout token=secret'); }]) {
    t.mock.method(globalThis, 'fetch', fn);
    await assert.rejects(binance({ symbol: 'BTCUSDT', timeframe: '5m' }), /Binance/);
    t.mock.restoreAll();
  }
  await assert.rejects(twelveData({ symbol: 'EURUSD', timeframe: '5m' }), /MARKET_DATA_API_KEY/);
});
test('Twelve Data: normalización UTC y duración mensual', () => {
  const result = normalizeCandles([{ datetime: '2026-10-07 12:00:00', open: '1', high: '2', low: '0.5', close: '1.5' }]);
  assert.equal(result[0].timestamp, Date.parse('2026-10-07T12:00:00Z') / 1000);
  const start = Date.parse('2026-10-01T00:00:00Z') / 1000;
  assert.equal(candleCloseTime(start, '1M'), Date.parse('2026-11-01T00:00:00Z') / 1000);
});
test('Telegram: rechazos y entrega incierta sin exponer tokens', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ ok: false }, { status: 400 }));
  await assert.rejects(telegramRequest('sendMessage', {}), (error) => error.deliveryUncertain === false && !error.message.includes('test-token'));
  t.mock.restoreAll();
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('secret-token'); });
  await assert.rejects(telegramRequest('sendMessage', {}), (error) => error.deliveryUncertain === true && !error.message.includes('secret-token'));
});

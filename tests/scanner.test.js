import test from 'node:test';
import assert from 'node:assert/strict';
import { scan as runScan, formatAlert, signalExpiresAt } from '../src/services/scanner.js';
import { redisFixture } from './redis-fixture.js';
const candles = Array.from({ length: 60 }, (_, i) => ({ open: 100, high: 101, low: 99, close: 100,
  timestamp: 1700000000 + i * 300, closeTimestamp: 1700000300 + i * 300 }));
const valid = { id: 'doublebottom', name: 'Double Bottom', detect: () => ({ detected: true, confidence: 82, breakoutIndex: 59 }) };
const scan = (deps = {}) => runScan({ now: () => candles.at(-1).closeTimestamp * 1000, ...deps });
test('Scan: filtro confianza, aislamiento de errores, deduplicación entre ejecuciones', async (t) => {
  const { store } = await redisFixture(t); const messages = [];
  const deps = { store, market: async () => candles, send: async (text) => messages.push(text),
    patterns: [valid, { id: 'doubletop', name: 'Double Top', detect: () => { throw new Error('broken'); } },
      { id: 'ascendingtriangle', name: 'Ascending Triangle', detect: () => ({ detected: true, confidence: 74, breakoutIndex: 59 }) }] };
  const first = await scan(deps);
  assert.equal(first.status, 'partial'); assert.equal(first.sent, 1); assert.equal(first.errors, 1);
  assert.match(messages[0], /82%/); assert.match(messages[0], /UTC/);
  const second = await scan(deps);
  assert.equal(second.sent, 0); assert.equal(second.duplicates, 1); assert.equal(messages.length, 1);
  assert.equal((await store.getStats()).alertsSent, 1);
});
test('Scan: inactivo, patrones deshabilitados y bloqueo de concurrencia', async (t) => {
  const { store } = await redisFixture(t);
  await store.setSetting('active', false, 1);
  assert.equal((await scan({ store, market: () => { throw new Error('not called'); } })).status, 'inactive');
  await store.setSetting('active', true, 2);
  await store.setSetting('pattern:doublebottom', false, 3);
  assert.equal((await scan({ store, market: async () => candles, patterns: [valid] })).sent, 0);
  const lock = await store.claim('scan-lock');
  assert.equal((await scan({ store, market: () => { throw new Error('not called'); } })).status, 'busy');
  await store.release('scan-lock', lock);
});
test('Scan: datos insuficientes e inválidos liberan bloqueo y registran errores', async (t) => {
  const { store } = await redisFixture(t);
  for (const data of [candles.slice(0, 10), [{ open: NaN }], [...candles].reverse()]) {
    await assert.rejects(scan({ store, market: async () => data }));
    const lock = await store.claim('scan-lock');
    assert.ok(lock); await store.release('scan-lock', lock);
  }
  assert.equal((await store.getStats()).errors, 3);
});
test('Scan: fallo de Telegram conocido permite reintento; timeout conserva deduplicación', async (t) => {
  const { store } = await redisFixture(t);
  const deps = { store, market: async () => candles, patterns: [valid] };
  const failure = await scan({ ...deps, send: async () => { const error = new Error('rejected'); error.deliveryUncertain = false; throw error; } });
  assert.equal(failure.sent, 0);
  let sent = 0;
  assert.equal((await scan({ ...deps, send: async () => sent++ })).sent, 1);
  const later = candles.map((c) => ({ ...c, timestamp: c.timestamp + 86400, closeTimestamp: c.closeTimestamp + 86400 }));
  const { store: other } = await redisFixture(t);
  const timeout = await scan({ ...deps, store: other, market: async () => later, now: () => later.at(-1).closeTimestamp * 1000,
    send: async () => { const error = new Error('timeout'); error.deliveryUncertain = true; throw error; } });
  assert.equal(timeout.errors, 1);
  const retry = await scan({ ...deps, store: other, market: async () => later, now: () => later.at(-1).closeTimestamp * 1000, send: async () => sent++ });
  assert.equal(retry.duplicates, 1); assert.equal(sent, 1);
});
test('Scan: /stop durante lectura de mercado evita nuevas alertas', async (t) => {
  const { store } = await redisFixture(t);
  const result = await scan({ store, patterns: [valid], market: async () => {
    await store.setSetting('active', false, 1); return candles;
  }, send: () => { throw new Error('must not send'); } });
  assert.equal(result.sent, 0); assert.equal(result.status, 'configuration_changed');
});
test('Scan: fallo de almacenamiento bloquea alertas', async () => {
  await assert.rejects(scan({ store: { getSettings: async () => { throw new Error('unavailable'); } },
    send: () => { throw new Error('must not send'); } }));
});
test('Scan: descarta confirmaciones antiguas y datos retrasados antes de reservar o enviar', async (t) => {
  const { store } = await redisFixture(t);
  let reservations = 0, sent = 0;
  const deps = { store: { ...store, reserveAlert: async () => { reservations++; throw new Error('must not reserve'); } },
    market: async () => candles, send: async () => sent++ };
  const old = await scan({ ...deps, patterns: [{ ...valid, detect: () => ({ detected: true, confidence: 90, breakoutIndex: 2 }) }] });
  assert.equal(old.expired, 1); assert.equal(old.errors, 0);
  const delayed = await scan({ ...deps, patterns: [valid], now: () => (candles.at(-1).closeTimestamp + 601) * 1000 });
  assert.equal(delayed.expired, 1); assert.equal(delayed.status, 'completed');
  assert.equal(reservations, 0); assert.equal(sent, 0);
  assert.equal((await store.getStats()).alertsSent, 0);
});
test('Scan: acepta el límite de vigencia y rechaza un milisegundo después', async (t) => {
  const { store } = await redisFixture(t);
  let sent = 0;
  const deadline = (candles.at(-1).closeTimestamp + 600) * 1000;
  const deps = { store, market: async () => candles, patterns: [valid], send: async () => sent++ };
  const fresh = await scan({ ...deps, now: () => deadline });
  assert.equal(fresh.sent, 1); assert.equal(fresh.expired, 0);
  const expired = await scan({ ...deps, now: () => deadline + 1 });
  assert.equal(expired.expired, 1); assert.equal(expired.duplicates, 0); assert.equal(sent, 1);
});
test('Scan: cancela la reserva si la señal caduca durante Redis', async (t) => {
  const { store } = await redisFixture(t);
  let nowMs = (candles.at(-1).closeTimestamp + 600) * 1000;
  const result = await scan({ store: { ...store, reserveAlert: async (...args) => {
    const reservation = await store.reserveAlert(...args); nowMs++; return reservation;
  } }, market: async () => candles, patterns: [valid], now: () => nowMs,
  send: () => { throw new Error('must not send'); } });
  assert.equal(result.expired, 1); assert.equal(result.sent, 0);
  const retry = await scan({ store, market: async () => candles, patterns: [valid], send: async () => {} });
  assert.equal(retry.sent, 1); assert.equal(retry.duplicates, 0);
});
test('Scan: rechaza cierres inválidos o futuros y calcula el cierre si falta', async (t) => {
  const { store } = await redisFixture(t);
  const deps = { store, patterns: [valid], send: async () => {} };
  for (const closeTimestamp of [NaN, Infinity, 0, candles.at(-1).timestamp, candles.at(-1).closeTimestamp + 1]) {
    const data = candles.map((c, i) => i === 59 ? { ...c, closeTimestamp } : c);
    const result = await scan({ ...deps, market: async () => data });
    assert.equal(result.errors, 1); assert.equal(result.sent, 0);
  }
  const noClose = candles.map(({ closeTimestamp, ...c }) => c);
  assert.equal((await scan({ ...deps, market: async () => noClose })).sent, 1);
});
test('Vigencia: usa la temporalidad y meses naturales UTC', () => {
  const confirmation = Date.parse('2026-02-01T00:00:00Z') / 1000;
  assert.equal(signalExpiresAt(confirmation, '5m'), confirmation + 600);
  assert.equal(signalExpiresAt(confirmation, '1d'), confirmation + 2 * 86400);
  assert.equal(signalExpiresAt(confirmation, '1w'), confirmation + 2 * 604800);
  assert.equal(signalExpiresAt(confirmation, '1M'), Date.parse('2026-04-01T00:00:00Z') / 1000);
});
test('Formato de alerta usa momento de confirmación y valores actuales', () => {
  const text = formatAlert({ symbol: 'ETHUSDT', timeframe: '15m' }, { pattern: 'Double Top', confidence: 80 }, 1700000000);
  assert.match(text, /ETHUSDT/); assert.match(text, /2023-11-14 22:13:20 UTC/);
});

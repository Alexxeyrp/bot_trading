import test from 'node:test';
import assert from 'node:assert/strict';
import { createStorage, signalIdentity } from '../src/services/storage.js';
import { redisFixture } from './redis-fixture.js';
test('Redis: persistencia entre instancias y actualizaciones por campo ordenadas', async (t) => {
  const { store } = await redisFixture(t);
  await store.setSetting('symbol', 'ETHUSDT', 10);
  assert.equal(await store.setSetting('symbol', 'BTCUSDT', 9), false);
  await store.setSetting('minConfidence', 80, 8);
  await store.setSetting('pattern:doubletop', false, 11);
  const settings = await store.getSettings();
  assert.equal(settings.symbol, 'ETHUSDT'); assert.equal(settings.minConfidence, 80); assert.equal(settings.patterns.doubletop, false);
  await assert.rejects(store.setSetting('minConfidence', 101, 12));
});
test('Redis: reserva atómica, cooldown y retención independiente', async (t) => {
  const { store, advance } = await redisFixture(t);
  const reservations = await Promise.all(Array.from({ length: 8 }, () => store.reserveAlert('signal-1', 'group')));
  assert.equal(reservations.filter(Boolean).length, 1);
  assert.equal(await store.reserveAlert('signal-2', 'group'), null);
  await advance(3601);
  assert.equal(await store.reserveAlert('signal-1', 'group'), null);
  assert.ok(await store.reserveAlert('signal-2', 'group'));
  assert.ok(await store.reserveAlert('other-symbol-signal', 'other-symbol-group'));
});
test('Redis: liberar solo reservas propias y completar updates', async (t) => {
  const { store, advance } = await redisFixture(t);
  const token = await store.claim('lock', 10);
  assert.equal(await store.claim('lock', 10), null);
  await store.release('lock', 'wrong-token');
  assert.equal(await store.claim('lock', 10), null);
  await advance(11);
  const replacement = await store.claim('lock', 10);
  await store.release('lock', token);
  assert.equal(await store.claim('lock'), null);
  await store.release('lock', replacement);
  assert.ok(await store.claim('lock'));
  const update = await store.claim('update:1');
  await store.complete('update:1', update);
  await advance(200);
  assert.equal(await store.claim('update:1'), null);
});
test('Redis: cancelación segura y estadísticas', async (t) => {
  const { store } = await redisFixture(t);
  const reservation = await store.reserveAlert('s', 'g');
  await store.cancelAlert({ ...reservation, token: 'wrong' });
  assert.equal(await store.reserveAlert('s','g'), null);
  await store.cancelAlert(reservation);
  assert.ok(await store.reserveAlert('s','g'));
  await store.recordScan({ at: 'today', errors: 2 });
  await store.recordAlert({ pattern: 'Double Top', sentAt: 'today' });
  const stats = await store.getStats();
  assert.equal(stats.scans, 1); assert.equal(stats.errors, 2); assert.equal(stats.alertsSent, 1);
  assert.equal(stats.lastAlert.pattern, 'Double Top');
});
test('Redis: marca de confirmación impide señales antiguas después de expirar sus claves', async (t) => {
  const { store, advance } = await redisFixture(t);
  assert.ok(await store.reserveAlert('old', 'BTCUSDT|1M|Double Top', 1700000000));
  await advance(91 * 86400);
  assert.equal(await store.reserveAlert('old', 'BTCUSDT|1M|Double Top', 1700000000), null);
  assert.equal(await store.reserveAlert('older', 'BTCUSDT|1M|Double Top', 1699999999), null);
  assert.ok(await store.reserveAlert('new', 'BTCUSDT|1M|Double Top', 1700000001));
});
test('Identidad de señal incluye activo, timeframe, patrón y confirmación', () => {
  assert.equal(signalIdentity({ symbol: 'BTCUSDT', timeframe: '5m' }, { pattern: 'Double Top' }, 123), 'BTCUSDT|5m|Double Top|123');
});
test('Almacenamiento falla cerrado sin credenciales o ante error REST', async () => {
  await assert.rejects(createStorage({}).getSettings());
  const store = createStorage({ url: 'https://test.invalid', token: 'secret', prefix: 't' }, undefined, undefined, async () => ({ error: 'bad' }));
  await assert.rejects(store.getSettings(), /Almacenamiento/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { isAuthorized, commandReply, processUpdate } from '../src/services/commands.js';
import { redisFixture } from './redis-fixture.js';
function message(text = '/run', chat = 12345, sender = chat) {
  return { text, chat: { id: chat }, from: { id: sender, is_bot: false }, date: 1700000000 };
}
test('Telegram: solo usuario/chat autorizado; grupo restringido a administrador', () => {
  assert.equal(isAuthorized(message(), '12345'), true);
  assert.equal(isAuthorized(message('/run', 99), '12345'), false);
  assert.equal(isAuthorized(message('/run', 12345, 99), '12345'), false);
  assert.equal(isAuthorized({ ...message(), sender_chat: { id: 12345 } }, '12345'), false);
  assert.equal(isAuthorized({ ...message(), from: { id: 12345, is_bot: true } }, '12345'), false);
  assert.equal(isAuthorized(message('/run', -100, 12345), '-100'), true);
  assert.equal(isAuthorized(message('/run', -100, 99), '-100'), false);
  assert.equal(isAuthorized(message(), ''), false);
});
test('Telegram: usuario no autorizado no toca almacenamiento ni envía respuestas', async () => {
  const result = await processUpdate({ update_id: 1, message: message('/run', 99) }, {
    store: new Proxy({}, { get() { throw new Error('Must not access storage'); } }),
    send: () => { throw new Error('Must not reply'); },
  });
  assert.equal(result.status, 'unauthorized');
});
test('Comandos: configuración, estado, patrones y argumentos', async (t) => {
  const { store } = await redisFixture(t);
  let id = 0;
  for (const text of ['/stop', '/run', '/symbol ethusdt', '/timeframe 15m', '/confidence 80', '/disable doubletop']) {
    assert.ok(await commandReply(text, ++id, store));
  }
  const settings = await store.getSettings();
  assert.equal(settings.active, true); assert.equal(settings.symbol, 'ETHUSDT'); assert.equal(settings.timeframe, '15m');
  assert.equal(settings.minConfidence, 80); assert.equal(settings.patterns.doubletop, false);
  await commandReply('/enable doubletop', ++id, store);
  assert.equal((await store.getSettings()).patterns.doubletop, true);
  assert.match(await commandReply('/status', ++id, store), /ETHUSDT/);
  assert.match(await commandReply('/patterns', ++id, store), /Double Bottom/);
  for (const command of ['/start', '/help']) assert.match(await commandReply(command, ++id, store), /\/confidence/);
  const before = await store.getSettings();
  for (const text of ['/symbol ../bad', '/timeframe 2m', '/confidence -1', '/confidence 101', '/confidence 80.5',
    '/disable constructor', '/enable unknown', '/run extra', '/symbol', '/symbol BTCUSDT extra', '/unknown']) {
    await commandReply(text, ++id, store);
    assert.deepEqual(await store.getSettings(), before);
  }
});
test('Webhook: reintentos no reaplican configuración antigua ni repiten respuestas completadas', async (t) => {
  const { store } = await redisFixture(t); const replies = [];
  const deps = { store, send: async (text) => replies.push(text) };
  const update = { update_id: 1, message: message('/stop') };
  assert.equal((await processUpdate(update, deps)).status, 'processed');
  assert.equal((await processUpdate(update, deps)).status, 'duplicate');
  assert.equal(replies.length, 1);
  await processUpdate({ update_id: 2, message: message('/run') }, deps);
  await commandReply('/stop', 1, store);
  assert.equal((await store.getSettings()).active, true);
});
test('Webhook: pending updates se reintentan y errores de respuesta permiten recuperación', async (t) => {
  const { store } = await redisFixture(t);
  const update = { update_id: 12, message: message('/help') };
  const token = await store.claim('update:12', 120);
  await assert.rejects(processUpdate(update, { store, send: async () => {} }), /reintentar/);
  await store.release('update:12', token);
  await assert.rejects(processUpdate(update, { store, send: async () => { throw new Error('offline'); } }));
  assert.equal((await processUpdate(update, { store, send: async () => {} })).status, 'processed');
});
test('Telegram: ID aleatorio tras inactividad se ordena por fecha', async (t) => {
  const { store } = await redisFixture(t);
  await store.setSetting('active', false, 900, 1700000000);
  await store.setSetting('active', true, 100, 1701000000);
  assert.equal(await store.setSetting('active', false, 901, 1700000000), false);
  assert.equal((await store.getSettings()).active, true);
});

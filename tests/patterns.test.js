import test from 'node:test';
import assert from 'node:assert/strict';
import { detect as bottom } from '../src/patterns/doubleBottom.js';
import { detect as top } from '../src/patterns/doubleTop.js';
import { detect as triangle } from '../src/patterns/ascendingTriangle.js';
import { validateCandles } from '../src/utils/priceUtils.js';
const candles = (prices) => prices.map((close, i) => ({ open: close, close, high: close + 0.5, low: close - 0.5, timestamp: 1700000000 + i * 300 }));
const bottomPrices = [110,108,105,101,100,101,105,110,112,110,105,101,100,101,105,110,113,116];
for (const [name, detect, prices] of [['Double Bottom', bottom, bottomPrices], ['Double Top', top, bottomPrices.map((n) => 220 - n)]]) {
  test(`${name}: confirma ruptura y conserva interfaz`, () => {
    const result = detect(candles(prices));
    assert.equal(result.detected, true); assert.equal(result.pattern, name);
    assert.ok(result.confidence >= 0 && result.confidence <= 100);
    assert.equal(result.breakoutIndex, 16);
  });
  test(`${name}: rechaza candidato sin ruptura`, () => assert.deepEqual(detect(candles(prices.slice(0, 16))), { detected: false }));
  test(`${name}: rechaza extremos fuera de tolerancia`, () => {
    const data = candles(prices);
    data[12] = { ...data[12], open: 105, close: 105, high: 105.5, low: 104.5 };
    assert.equal(detect(data).detected, false);
  });
}
test('Ascending Triangle: resistencia y mínimos ascendentes con ruptura', () => {
  const highs = [101,104,108,110,108,106,107,108,109,108,107,108,109,110,109,108,113];
  const lows = [95,96,97,98,96,94,96,98,100,98,97,98,100,102,101,100,110];
  const data = highs.map((high, i) => ({ high, low: lows[i], open: (high + lows[i]) / 2,
    close: (high + lows[i]) / 2, timestamp: 1700000000 + i * 300 }));
  const result = triangle(data);
  assert.equal(result.detected, true); assert.equal(result.pattern, 'Ascending Triangle');
  assert.ok(Number.isFinite(result.confidence) && result.confidence >= 0 && result.confidence <= 100);
  assert.equal(result.breakoutIndex, 16);
  assert.equal(triangle(data.slice(0,16)).detected, false);
  data[10].low = 93;
  assert.equal(triangle(data).detected, false);
});
test('Detectores: velas vacías, planas e inválidas', () => {
  for (const detect of [bottom, top, triangle]) {
    assert.deepEqual(detect([]), { detected: false });
    assert.deepEqual(detect(candles(Array(60).fill(100))), { detected: false });
    assert.throws(() => detect([{ open: NaN }]));
  }
  assert.throws(() => validateCandles([{ open: 100, close: 101, high: 99, low: 90, timestamp: 1 }]));
});
test('Double Bottom selecciona la confirmación más reciente del histórico', () => {
  const prices = [...bottomPrices, 117, 115, 110, 105, 101, 100, 101, 105, 111, 113, 111, 105, 101, 100, 101, 105, 110, 118];
  assert.ok(bottom(candles(prices)).breakoutIndex > 16);
});

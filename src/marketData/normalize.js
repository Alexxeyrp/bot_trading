export function normalizeCandles(values) {
  return values
    .map((candle) => ({
      open: Number(candle.open),
      high: Number(candle.high),
      low: Number(candle.low),
      close: Number(candle.close),
      timestamp: Math.floor(new Date(`${candle.datetime.replace(' ', 'T')}Z`).getTime() / 1000),
    }))
    .reverse();
}

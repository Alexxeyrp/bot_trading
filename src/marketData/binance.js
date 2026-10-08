import config from '../config.js';
import { requestJson } from '../utils/http.js';
export async function getCandles(settings, now = Date.now()) {
  const url = new URL(`${config.marketData.apiUrl}/api/v3/klines`);
  url.search = new URLSearchParams({ symbol: settings.symbol, interval: settings.timeframe, limit: config.candleLimit });
  try {
    const rows = await requestJson(url);
    if (!Array.isArray(rows) || rows.some((row) => !Array.isArray(row) || row.length < 7)) throw new Error('Invalid data');
    return rows.filter((row) => Number(row[6]) < now).map((row) => ({
      timestamp: Number(row[0]) / 1000, closeTimestamp: (Number(row[6]) + 1) / 1000,
      open: Number(row[1]), high: Number(row[2]), low: Number(row[3]), close: Number(row[4]) }));
  } catch { throw new Error('Binance: timeout, HTTP o datos inválidos'); }
}

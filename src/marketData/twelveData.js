import config from '../config.js';
import { normalizeCandles } from './normalize.js';
import { toProviderInterval, toProviderSymbol, candleCloseTime } from './helpers.js';
import { requestJson } from '../utils/http.js';
export async function getCandles(settings, now = Date.now()) {
  if (!config.marketData.apiKey) throw new Error('Falta MARKET_DATA_API_KEY para Twelve Data');
  const url = new URL(`${config.marketData.apiUrl}/time_series`);
  url.search = new URLSearchParams({ symbol: toProviderSymbol(settings.symbol), interval: toProviderInterval(settings.timeframe),
    outputsize: config.candleLimit, apikey: config.marketData.apiKey, timezone: 'UTC' });
  try {
    const data = await requestJson(url);
    if (data.status === 'error' || !Array.isArray(data.values)) throw new Error('Invalid data');
    return normalizeCandles(data.values).map((candle) => ({ ...candle,
      closeTimestamp: candleCloseTime(candle.timestamp, settings.timeframe) })).filter((candle) => candle.closeTimestamp * 1000 <= now);
  } catch { throw new Error('Twelve Data: timeout, HTTP o datos inválidos'); }
}

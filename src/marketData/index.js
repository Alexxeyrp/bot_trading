import config from '../config.js';
import { getCandles as twelveData } from './twelveData.js';
import { getCandles as binance } from './binance.js';
import { validateCandles } from '../utils/priceUtils.js';
export async function getCandles(settings = config.defaults) {
  const candles = await (config.dataProvider === 'binance' ? binance(settings) : twelveData(settings));
  validateCandles(candles);
  if (candles.some((candle, index) => index > 0 && candle.timestamp <= candles[index - 1].timestamp)) throw new Error('Velas desordenadas o duplicadas');
  return candles;
}

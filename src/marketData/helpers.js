export function toProviderSymbol(symbol) {
  const normalized = symbol.replace('/', '').toUpperCase();

  if (normalized.length !== 6) {
    throw new Error(`Símbolo Forex inválido: ${symbol}`);
  }

  return `${normalized.slice(0, 3)}/${normalized.slice(3)}`;
}

export function candleCloseTime(timestamp, timeframe) {
  const date = new Date(timestamp * 1000);
  if (timeframe === '1M') {
    date.setUTCMonth(date.getUTCMonth() + 1);
    return date.getTime() / 1000;
  }
  const unit = { m: 60, h: 3600, d: 86400, w: 604800 }[timeframe.slice(-1)];
  if (!unit) throw new Error('Temporalidad inválida');
  return timestamp + Number(timeframe.slice(0, -1)) * unit;
}

export function toProviderInterval(timeframe) {
  const intervals = {
    '1m': '1min',
    '5m': '5min',
    '15m': '15min',
    '30m': '30min',
    '45m': '45min',
    '1h': '1h',
    '2h': '2h',
    '4h': '4h',
    '8h': '8h',
    '1d': '1day',
    '1w': '1week',
    '1M': '1month',
  };

  const interval = intervals[timeframe];

  if (!interval) {
    throw new Error(`Temporalidad no soportada: ${timeframe}`);
  }

  return interval;
}

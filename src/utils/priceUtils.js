const CANDLE_FIELDS = ['open', 'high', 'low', 'close', 'timestamp'];
const PRICE_FIELDS = ['open', 'high', 'low', 'close'];

export function validateCandles(candles) {
  if (!Array.isArray(candles)) {
    throw new TypeError('candles debe ser un array');
  }

  if (!candles.every(isValidCandle)) {
    throw new TypeError('Cada vela debe contener valores OHLC y timestamp numericos');
  }
}

export function getPrices(candles, field) {
  validateCandles(candles);

  if (!PRICE_FIELDS.includes(field)) {
    throw new TypeError(`Campo de precio no valido: ${field}`);
  }

  return candles.map((candle) => candle[field]);
}

export function getOpens(candles) {
  return getPrices(candles, 'open');
}

export function getHighs(candles) {
  return getPrices(candles, 'high');
}

export function getLows(candles) {
  return getPrices(candles, 'low');
}

export function getCloses(candles) {
  return getPrices(candles, 'close');
}

export function findLowestLow(candles) {
  validateNonEmptyCandles(candles);
  return Math.min(...getLows(candles));
}

export function findHighestHigh(candles) {
  validateNonEmptyCandles(candles);
  return Math.max(...getHighs(candles));
}

export function calculatePercentageDifference(a, b) {
  validateFiniteNumber(a, 'a');
  validateFiniteNumber(b, 'b');

  if (a === 0 && b === 0) {
    return 0;
  }

  const referenceValue = (Math.abs(a) + Math.abs(b)) / 2;

  if (referenceValue === 0) {
    throw new RangeError('No se puede calcular diferencia porcentual con referencia cero');
  }

  return Math.abs(a - b) / referenceValue;
}

export function isWithinTolerance(a, b, tolerance) {
  validateFiniteNumber(tolerance, 'tolerance');

  if (tolerance < 0 || tolerance > 1) {
    throw new RangeError('tolerance debe ser un numero entre 0 y 1');
  }

  return calculatePercentageDifference(a, b) <= tolerance;
}

function validateNonEmptyCandles(candles) {
  validateCandles(candles);

  if (candles.length === 0) {
    throw new RangeError('candles no puede estar vacio');
  }
}

function validateFiniteNumber(value, name) {
  if (!Number.isFinite(value)) {
    throw new TypeError(`${name} debe ser un numero finito`);
  }
}

function isValidCandle(candle) {
  return candle !== null
    && typeof candle === 'object'
    && CANDLE_FIELDS.every((field) => Number.isFinite(candle[field]))
    && PRICE_FIELDS.every((field) => candle[field] > 0)
    && candle.timestamp > 0
    && candle.high >= Math.max(candle.open, candle.close, candle.low)
    && candle.low <= Math.min(candle.open, candle.close, candle.high);
}

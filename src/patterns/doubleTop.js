import config from '../config.js';
import { findLowestLow } from '../utils/priceUtils.js';
import logger from '../utils/logger.js';
import { detectDoublePattern } from './doublePattern.js';

/**
 * Detecta un patron de doble techo en una serie de velas.
 *
 * @param {Array<object>} candles
 * @returns {{ detected: boolean, pattern?: string, confidence?: number }}
 */
export function detect(candles) {
  const result = detectDoublePattern(candles, {
    patternName: 'Double Top',
    pointLabel: 'maximos',
    levelLabel: 'soporte',
    priceField: 'high',
    tolerance: config.doubleTopTolerance,
    minSeparation: config.minPatternSeparation,
    isLocalPoint: isLocalHigh,
    findLevel: findLowestLow,
    isBreakout: (candle, support) => candle.close < support * (1 - config.breakoutConfirmationPercent),
  });

  if (!result) {
    return { detected: false };
  }

  logger.info(
    `Double Top detectado: maximos=${result.firstPointIndex}/${result.secondPointIndex}, soporte=${result.level}, ruptura=${result.breakoutIndex}, confianza=${result.confidence}`,
  );

  return {
    detected: true,
    pattern: 'Double Top',
    confidence: result.confidence,
    breakoutPrice: result.breakoutPrice,
    breakoutIndex: result.breakoutIndex,
  };
}

function isLocalHigh(candles, index, priceField, pivotWindow) {
  const currentValue = candles[index][priceField];

  for (let offset = 1; offset <= pivotWindow; offset += 1) {
    if (
      currentValue <= candles[index - offset][priceField]
      || currentValue <= candles[index + offset][priceField]
    ) {
      return false;
    }
  }

  return true;
}

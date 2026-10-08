import config from '../config.js';
import { findHighestHigh } from '../utils/priceUtils.js';
import logger from '../utils/logger.js';
import { detectDoublePattern } from './doublePattern.js';

/**
 * Detecta un patron de doble suelo en una serie de velas.
 *
 * @param {Array<object>} candles
 * @returns {{ detected: boolean, pattern?: string, confidence?: number }}
 */
export function detect(candles) {
  const result = detectDoublePattern(candles, {
    patternName: 'Double Bottom',
    pointLabel: 'minimos',
    levelLabel: 'resistencia',
    priceField: 'low',
    tolerance: config.doubleBottomTolerance,
    minSeparation: config.minPatternSeparation,
    isLocalPoint: isLocalLow,
    findLevel: findHighestHigh,
    isBreakout: (candle, resistance) => candle.close > resistance * (1 + config.breakoutConfirmationPercent),
  });

  if (!result) {
    return { detected: false };
  }

  logger.info(
    `Double Bottom detectado: minimos=${result.firstPointIndex}/${result.secondPointIndex}, resistencia=${result.level}, ruptura=${result.breakoutIndex}, confianza=${result.confidence}`,
  );

  return {
    detected: true,
    pattern: 'Double Bottom',
    confidence: result.confidence,
    breakoutPrice: result.breakoutPrice,
    breakoutIndex: result.breakoutIndex,
  };
}

function isLocalLow(candles, index, priceField, pivotWindow) {
  const currentValue = candles[index][priceField];

  for (let offset = 1; offset <= pivotWindow; offset += 1) {
    if (
      currentValue >= candles[index - offset][priceField]
      || currentValue >= candles[index + offset][priceField]
    ) {
      return false;
    }
  }

  return true;
}

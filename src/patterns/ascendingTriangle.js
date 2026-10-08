import config from '../config.js';
import {
  calculatePercentageDifference,
  isWithinTolerance,
  validateCandles,
} from '../utils/priceUtils.js';
import logger from '../utils/logger.js';
import { logPatternDebug } from './doublePattern.js';

/**
 * Detecta un triangulo ascendente en una serie de velas.
 *
 * @param {Array<object>} candles
 * @returns {{ detected: boolean, pattern?: string, confidence?: number }}
 */
export function detect(candles) {
  validateCandles(candles);

  logPatternDebug(`Ascending Triangle: analizando ${candles.length} velas`);

  if (candles.length < config.minPatternSeparation + (config.pivotWindow * 2) + 1) {
    logPatternDebug('Ascending Triangle: velas insuficientes para evaluar el patron');
    return { detected: false };
  }

  const highs = findLocalHighs(candles);
  const lows = findLocalLows(candles);

  logPatternDebug(`Ascending Triangle: maximos encontrados ${formatPoints(candles, highs, 'high')}`);
  logPatternDebug(`Ascending Triangle: minimos encontrados ${formatPoints(candles, lows, 'low')}`);

  let latest = null;
  for (let firstIndex = 0; firstIndex < highs.length - 1; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < highs.length; secondIndex += 1) {
      const firstHighIndex = highs[firstIndex];
      const secondHighIndex = highs[secondIndex];
      const separation = secondHighIndex - firstHighIndex;

      if (separation < config.minPatternSeparation) {
        logPatternDebug(
          `Ascending Triangle: candidato descartado por separacion (${separation})`,
        );
        continue;
      }

      const firstHigh = candles[firstHighIndex].high;
      const secondHigh = candles[secondHighIndex].high;
      const highDifference = calculatePercentageDifference(firstHigh, secondHigh);

      if (!isWithinTolerance(firstHigh, secondHigh, config.triangleTolerance)) {
        logPatternDebug(
          `Ascending Triangle: maximos no similares (${firstHigh} vs ${secondHigh}), diferencia=${formatPercentage(highDifference * 100)}`,
        );
        continue;
      }

      const patternLows = lows.filter((index) => (
        index > firstHighIndex && index < secondHighIndex
      ));

      if (patternLows.length < 2 || !hasAscendingLows(candles, patternLows)) {
        logPatternDebug(
          `Ascending Triangle: minimos no ascendentes ${formatPoints(candles, patternLows, 'low')}`,
        );
        continue;
      }

      const resistance = (firstHigh + secondHigh) / 2;
      const breakoutIndex = findBreakoutIndex(candles, secondHighIndex + 1, resistance);

      logPatternDebug(
        `Ascending Triangle: candidato maximos=${firstHighIndex}/${secondHighIndex}, resistencia=${resistance}, diferenciaMaximos=${formatPercentage(highDifference * 100)}, minimos=${formatPoints(candles, patternLows, 'low')}, ruptura=${breakoutIndex}`,
      );

      if (breakoutIndex !== -1) {
        const confidence = calculateConfidence({
          candles,
          highDifference,
          patternLows,
          resistance,
          breakoutIndex,
        });

        if (latest && latest.breakoutIndex > breakoutIndex) continue;
        latest = {
          detected: true,
          pattern: 'Ascending Triangle',
          confidence,
          breakoutPrice: candles[breakoutIndex].close,
          breakoutIndex,
        };
      }
    }
  }

  if (!latest) logPatternDebug('Ascending Triangle: no se detecto ruptura alcista valida');
  if (latest) logger.info(`Ascending Triangle detectado: ruptura=${latest.breakoutIndex}, confianza=${latest.confidence}`);
  return latest ?? { detected: false };
}

function findLocalHighs(candles) {
  const highs = [];

  for (let index = config.pivotWindow; index < candles.length - config.pivotWindow; index += 1) {
    if (isLocalHigh(candles, index)) {
      highs.push(index);
    }
  }

  return highs;
}

function findLocalLows(candles) {
  const lows = [];

  for (let index = config.pivotWindow; index < candles.length - config.pivotWindow; index += 1) {
    if (isLocalLow(candles, index)) {
      lows.push(index);
    }
  }

  return lows;
}

function isLocalHigh(candles, index) {
  for (let offset = 1; offset <= config.pivotWindow; offset += 1) {
    if (
      candles[index].high <= candles[index - offset].high
      || candles[index].high <= candles[index + offset].high
    ) {
      return false;
    }
  }

  return true;
}

function isLocalLow(candles, index) {
  for (let offset = 1; offset <= config.pivotWindow; offset += 1) {
    if (
      candles[index].low >= candles[index - offset].low
      || candles[index].low >= candles[index + offset].low
    ) {
      return false;
    }
  }

  return true;
}

function hasAscendingLows(candles, lows) {
  for (let index = 1; index < lows.length; index += 1) {
    if (candles[lows[index]].low <= candles[lows[index - 1]].low) {
      return false;
    }
  }

  return true;
}

function findBreakoutIndex(candles, startIndex, resistance) {
  const confirmedResistance = resistance * (1 + config.breakoutConfirmationPercent);

  for (let index = startIndex; index < candles.length; index += 1) {
    if (candles[index].close > confirmedResistance) {
      return index;
    }
  }

  return -1;
}

function calculateConfidence({
  candles,
  highDifference,
  patternLows,
  resistance,
  breakoutIndex,
}) {
  const highSimilarityScore = scoreByTolerance(highDifference, config.triangleTolerance, 30);
  const ascendingLowsScore = calculateAscendingLowsScore(candles, patternLows);
  const structureScore = Math.min(patternLows.length, 3) / 3 * 15;
  const breakoutDifference = calculatePercentageDifference(
    candles[breakoutIndex].close,
    resistance,
  );
  const breakoutScore = ratioScore(breakoutDifference, 25);

  return Math.round(
    highSimilarityScore + ascendingLowsScore + structureScore + breakoutScore,
  );
}

function scoreByTolerance(value, tolerance, maxScore) {
  if (tolerance === 0) {
    return value === 0 ? maxScore : 0;
  }

  return Math.max(0, 1 - (value / tolerance)) * maxScore;
}

function calculateAscendingLowsScore(candles, lows) {
  const firstLow = candles[lows[0]].low;
  const lastLow = candles[lows[lows.length - 1]].low;
  const lowProgression = calculatePercentageDifference(firstLow, lastLow);

  return ratioScore(lowProgression, 30);
}

function ratioScore(value, max) {
  if (config.triangleTolerance === 0) return value > 0 ? max : 0;
  return Math.min(value / config.triangleTolerance, 1) * max;
}

function formatPoints(candles, points, field) {
  if (points.length === 0) {
    return '[]';
  }

  return points
    .map((index) => `{ index: ${index}, ${field}: ${candles[index][field]} }`)
    .join(', ');
}

function formatPercentage(value) {
  return `${value.toFixed(2)}%`;
}

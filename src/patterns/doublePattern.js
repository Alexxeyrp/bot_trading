import config from '../config.js';
import {
  calculatePercentageDifference,
  isWithinTolerance,
  validateCandles,
} from '../utils/priceUtils.js';
import logger from '../utils/logger.js';

export function detectDoublePattern(candles, options) {
  validateCandles(candles);

  const {
    patternName,
    pointLabel,
    levelLabel,
    priceField,
    tolerance,
    minSeparation,
    isLocalPoint,
    findLevel,
    isBreakout,
  } = options;

  logPatternDebug(`${patternName}: analizando ${candles.length} velas`);

  if (candles.length < minSeparation + (config.pivotWindow * 2) + 1) {
    logPatternDebug(`${patternName}: velas insuficientes para evaluar el patron`);
    return null;
  }

  const points = findLocalPoints(candles, priceField, isLocalPoint);
  logPatternDebug(
    `${patternName}: ${pointLabel} encontrados ${formatLocalPoints(candles, points, priceField)}`,
  );

  let latest = null;
  for (let firstIndex = 0; firstIndex < points.length - 1; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < points.length; secondIndex += 1) {
      const firstPointIndex = points[firstIndex];
      const secondPointIndex = points[secondIndex];
      const separation = secondPointIndex - firstPointIndex;

      if (separation < minSeparation) {
        logPatternDebug(
          `${patternName}: candidato descartado por separacion (${separation})`,
        );
        continue;
      }

      const firstValue = candles[firstPointIndex][priceField];
      const secondValue = candles[secondPointIndex][priceField];
      const similarityPercentage = calculatePercentageDifference(firstValue, secondValue) * 100;

      if (!isWithinTolerance(firstValue, secondValue, tolerance)) {
        logPatternDebug(
          `${patternName}: ${pointLabel} no similares (${firstValue} vs ${secondValue}), diferencia=${formatPercentage(similarityPercentage)}`,
        );
        continue;
      }

      const betweenCandles = candles.slice(firstPointIndex + 1, secondPointIndex);
      const level = findLevel(betweenCandles);
      const breakoutIndex = findBreakoutIndex(candles, secondPointIndex + 1, level, isBreakout);

      logPatternDebug(
        `${patternName}: candidato ${pointLabel}=${firstPointIndex}/${secondPointIndex}, ${levelLabel}=${level}, similitud=${formatPercentage(similarityPercentage)}, ruptura=${breakoutIndex}`,
      );

      if (breakoutIndex !== -1) {
        const confidence = calculateConfidence({
          candles,
          priceField,
          firstPointIndex,
          secondPointIndex,
          level,
          breakoutIndex,
          similarityDifference: similarityPercentage / 100,
          tolerance,
          minSeparation,
        });

        if (latest && latest.breakoutIndex > breakoutIndex) continue;
        latest = {
          firstPointIndex,
          secondPointIndex,
          level,
          breakoutIndex,
          breakoutPrice: candles[breakoutIndex].close,
          similarityPercentage,
          confidence,
        };
      }
    }
  }

  if (!latest) logPatternDebug(`${patternName}: no se detecto ruptura valida`);
  return latest;
}

function findLocalPoints(candles, priceField, isLocalPoint) {
  const points = [];

  for (let index = config.pivotWindow; index < candles.length - config.pivotWindow; index += 1) {
    if (isLocalPoint(candles, index, priceField, config.pivotWindow)) {
      points.push(index);
    }
  }

  return points;
}

function findBreakoutIndex(candles, startIndex, level, isBreakout) {
  for (let index = startIndex; index < candles.length; index += 1) {
    if (isBreakout(candles[index], level)) {
      return index;
    }
  }

  return -1;
}

export function logPatternDebug(message) {
  if (config.debugPatterns) {
    logger.info(`[DEBUG_PATTERNS] ${message}`);
  }
}

function calculateConfidence({
  candles,
  priceField,
  firstPointIndex,
  secondPointIndex,
  level,
  breakoutIndex,
  similarityDifference,
  tolerance,
  minSeparation,
}) {
  const similarityScore = scoreByTolerance(similarityDifference, tolerance, 35);
  const separation = secondPointIndex - firstPointIndex;
  const separationScore = calculateSeparationScore(separation, minSeparation);
  const breakoutDifference = calculatePercentageDifference(candles[breakoutIndex].close, level);
  const breakoutScore = scoreByRatio(breakoutDifference, tolerance, 25);
  const pointLevel = (
    candles[firstPointIndex][priceField] + candles[secondPointIndex][priceField]
  ) / 2;
  const structureMove = calculatePercentageDifference(pointLevel, level);
  const structureScore = scoreByRatio(structureMove, tolerance * 2, 20);

  return Math.round(
    similarityScore + separationScore + breakoutScore + structureScore,
  );
}

function calculateSeparationScore(separation, minSeparation) {
  if (minSeparation <= 0) {
    return 20;
  }

  const extraSeparation = Math.max(0, separation - minSeparation);
  return 10 + Math.min(extraSeparation / (minSeparation * 2), 1) * 10;
}

function scoreByTolerance(value, tolerance, maxScore) {
  if (tolerance === 0) {
    return value === 0 ? maxScore : 0;
  }

  return Math.max(0, 1 - (value / tolerance)) * maxScore;
}

function scoreByRatio(value, scale, maxScore) {
  if (scale === 0) {
    return value > 0 ? maxScore : 0;
  }

  return Math.min(value / scale, 1) * maxScore;
}

function formatLocalPoints(candles, points, priceField) {
  if (points.length === 0) {
    return '[]';
  }

  return points
    .map((index) => `{ index: ${index}, ${priceField}: ${candles[index][priceField]} }`)
    .join(', ');
}

function formatPercentage(value) {
  return `${value.toFixed(2)}%`;
}

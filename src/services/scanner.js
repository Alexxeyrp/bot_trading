import { detect as bottom } from '../patterns/doubleBottom.js';
import { detect as top } from '../patterns/doubleTop.js';
import { detect as triangle } from '../patterns/ascendingTriangle.js';
import config from '../config.js';
import logger from '../utils/logger.js';
import { validateCandles } from '../utils/priceUtils.js';
import { getCandles } from '../marketData/index.js';
import { sendMessage } from './telegram.js';
import { storage, signalIdentity } from './storage.js';

export const detectors = [
  { id: 'doublebottom', name: 'Double Bottom', detect: bottom },
  { id: 'doubletop', name: 'Double Top', detect: top },
  { id: 'ascendingtriangle', name: 'Ascending Triangle', detect: triangle },
];
export function formatAlert(settings, result, confirmation) {
  return ['🚨 PATRÓN DETECTADO', '', `📊 Activo: ${settings.symbol}`, `⏱ Temporalidad: ${settings.timeframe}`, '',
    `📈 Patrón: ${result.pattern}`, `🎯 Confianza: ${result.confidence}%`, '',
    `🕐 Confirmación: ${new Date(confirmation * 1000).toISOString().replace('T', ' ').replace('.000Z', ' UTC')}`].join('\n');
}
export async function scan({ store = storage, market = getCandles, send = sendMessage, patterns = detectors } = {}) {
  const initial = await store.getSettings();
  if (!initial.active) {
    logger.info('Scanner inactivo; invocación omitida');
    return { status: 'inactive', sent: 0 };
  }
  const token = await store.claim('scan-lock', 180);
  if (!token) {
    logger.info('Scanner ocupado; invocación omitida');
    return { status: 'busy', sent: 0 };
  }
  const summary = { status: 'completed', at: new Date().toISOString(), sent: 0, detected: 0, duplicates: 0, errors: 0 };
  try {
    const settings = await store.getSettings();
    if (!settings.active) return { status: 'inactive', sent: 0 };
    logger.info(`Scanner iniciado: ${settings.symbol} ${settings.timeframe}`);
    let candles;
    try {
      candles = await market(settings);
      validateCandles(candles);
      if (candles.length < config.minCandles) throw new Error('Datos OHLC insuficientes');
      if (candles.some((candle, i) => i > 0 && candle.timestamp <= candles[i - 1].timestamp)) throw new Error('Velas desordenadas');
    } catch {
      logger.error('Error obteniendo mercado: timeout, HTTP, OHLC inválidos o insuficientes');
      throw new Error('No se pudo completar el análisis de mercado');
    }
    for (const { id, name, detect } of patterns) {
      if (!settings.patterns[id]) continue;
      let result;
      try {
        result = detect(candles);
        if (!result.detected) continue;
        summary.detected++;
        logger.info(`Patrón encontrado: ${name}, confianza=${result.confidence}`);
        if (!Number.isFinite(result.confidence) || result.confidence < settings.minConfidence || result.confidence > 100) continue;
        if (!Number.isInteger(result.breakoutIndex) || !candles[result.breakoutIndex]) throw new Error('Confirmación inválida');
      } catch {
        summary.errors++;
        logger.error(`Error en detector: ${name}`);
        continue;
      }
      const current = await store.getSettings();
      if (!current.active || current.symbol !== settings.symbol || current.timeframe !== settings.timeframe) {
        summary.status = 'configuration_changed';
        break;
      }
      if (!current.patterns[id] || result.confidence < current.minConfidence) continue;
      const confirmation = candles[result.breakoutIndex].closeTimestamp ?? candles[result.breakoutIndex].timestamp;
      const identity = signalIdentity(settings, { pattern: name }, confirmation);
      const reservation = await store.reserveAlert(identity, `${settings.symbol}|${settings.timeframe}|${name}`, confirmation);
      if (!reservation) { summary.duplicates++; continue; }
      try {
        await send(formatAlert(settings, { ...result, pattern: name }, confirmation));
      } catch (error) {
        summary.errors++;
        logger.error(`Fallo enviando alerta: ${name}; entrega ${error.deliveryUncertain ? 'incierta' : 'rechazada'}`);
        // Un timeout puede ocurrir después de la entrega: conservar la reserva evita duplicados.
        if (!error.deliveryUncertain) await store.cancelAlert(reservation);
        continue;
      }
      summary.sent++;
      await store.recordAlert({ symbol: settings.symbol, timeframe: settings.timeframe, pattern: name,
        confidence: result.confidence, confirmation, sentAt: new Date().toISOString() });
      logger.info(`Alerta enviada: ${name}`);
    }
    if (summary.errors > 0) summary.status = 'partial';
    await store.recordScan(summary);
    logger.info(`Scanner finalizado: ${JSON.stringify(summary)}`);
    return summary;
  } catch {
    summary.status = 'failed';
    summary.errors++;
    try { await store.recordScan(summary); } catch { logger.error('No se pudo persistir el resultado del scanner'); }
    throw new Error('Scanner: error de mercado o almacenamiento');
  } finally {
    try { await store.release('scan-lock', token); } catch { logger.error('No se pudo liberar el bloqueo; caducará automáticamente'); }
  }
}

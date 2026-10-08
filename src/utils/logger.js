import winston from 'winston';
import config from '../config.js';
const secrets = [config.telegram.botToken, config.telegram.webhookSecret, config.cronSecret, config.storage.token, config.marketData.apiKey].filter(Boolean);
const redact = winston.format((info) => {
  let message = String(info.message);
  for (const secret of secrets) message = message.split(secret).join('[REDACTED]');
  info.message = message.replace(/bot\d+:[A-Za-z0-9_-]+/g, 'bot[REDACTED]');
  return info;
});
export default winston.createLogger({ level: config.logLevel,
  format: winston.format.combine(redact(), winston.format.timestamp(), winston.format.json()),
  transports: [new winston.transports.Console()] });

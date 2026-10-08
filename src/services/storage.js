import { createHash, randomUUID } from 'node:crypto';
import config, { PATTERNS, validateSettings } from '../config.js';
import { requestJson } from '../utils/http.js';

export const SCRIPTS = Object.freeze({
  settings: `
    local defaults = cjson.decode(ARGV[1])
    for field, value in pairs(defaults) do redis.call('HSETNX', KEYS[1], field, value) end
    return redis.call('HGETALL', KEYS[1])
  `,
  setting: `
    local previous = redis.call('HGET', KEYS[2], ARGV[1]) or '0:-1'
    local date, id = string.match(previous, '^(%d+):(-?%d+)$')
    if tonumber(ARGV[4]) < tonumber(date) or
       (tonumber(ARGV[4]) == tonumber(date) and tonumber(ARGV[3]) <= tonumber(id)) then return 0 end
    redis.call('HSET', KEYS[1], ARGV[1], ARGV[2])
    redis.call('HSET', KEYS[2], ARGV[1], ARGV[4] .. ':' .. ARGV[3])
    return 1
  `,
  release: `
    if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end
    return 0
  `,
  complete: `
    if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
    redis.call('SET', KEYS[1], 'done', 'EX', ARGV[2])
    return 1
  `,
  alert: `
    local previous = redis.call('HGET', KEYS[3], 'timestamp') or '0'
    if tonumber(ARGV[4]) > 0 and tonumber(ARGV[4]) <= tonumber(previous) then return {0, previous} end
    if redis.call('EXISTS', KEYS[1]) == 1 or redis.call('EXISTS', KEYS[2]) == 1 then return 0 end
    redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[2])
    redis.call('SET', KEYS[2], ARGV[1], 'EX', ARGV[3])
    if tonumber(ARGV[4]) > 0 then redis.call('HSET', KEYS[3], 'timestamp', ARGV[4], 'token', ARGV[1]) end
    return {1, previous}
  `,
  cancelAlert: `
    for _, key in ipairs({KEYS[1], KEYS[2]}) do
      if redis.call('GET', key) == ARGV[1] then redis.call('DEL', key) end
    end
    if redis.call('HGET', KEYS[3], 'token') == ARGV[1] then
      redis.call('HSET', KEYS[3], 'timestamp', ARGV[2], 'token', '')
    end
    return 1
  `,
  alertStats: `
    redis.call('HINCRBY', KEYS[1], 'alertsSent', 1)
    redis.call('HSET', KEYS[1], 'lastAlert', ARGV[1])
    return 1
  `,
  scanStats: `
    redis.call('HINCRBY', KEYS[1], 'scans', 1)
    redis.call('HINCRBY', KEYS[1], 'errors', ARGV[2])
    redis.call('HSET', KEYS[1], 'lastScan', ARGV[1])
    return 1
  `,
});
function flatten(settings) {
  return { active: JSON.stringify(settings.active), symbol: settings.symbol, timeframe: settings.timeframe,
    minConfidence: String(settings.minConfidence),
    ...Object.fromEntries(Object.entries(settings.patterns).map(([id, enabled]) => [`pattern:${id}`, JSON.stringify(enabled)])) };
}
function hash(value) { return createHash('sha256').update(value).digest('hex'); }
export function signalIdentity(settings, result, timestamp) {
  return [settings.symbol, settings.timeframe, result.pattern, timestamp].join('|');
}
export function createStorage(options = config.storage, defaults = config.defaults, provider = config.dataProvider, transport = requestJson) {
  const key = (name) => `${options.prefix}:${name}`;
  async function command(args) {
    if (!options.url || !options.token) throw new Error('Faltan credenciales de Upstash Redis');
    if (new URL(options.url).protocol !== 'https:') throw new Error('Redis REST debe usar HTTPS');
    try {
      const response = await transport(options.url, { method: 'POST',
        headers: { Authorization: `Bearer ${options.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(args) }, 3000);
      if (response.error || !Object.hasOwn(response, 'result')) throw new Error('Invalid Redis response');
      return response.result;
    } catch { throw new Error('Almacenamiento no disponible o respuesta inválida'); }
  }
  const evalScript = (script, keys, args = []) => command(['EVAL', script, keys.length, ...keys, ...args]);
  async function getSettings() {
    const values = await evalScript(SCRIPTS.settings, [key('settings')], [JSON.stringify(flatten(defaults))]);
    if (!Array.isArray(values)) throw new Error('Estado persistido inválido');
    const fields = Object.fromEntries(Array.from({ length: values.length / 2 }, (_, i) => [values[i * 2], values[i * 2 + 1]]));
    return validateSettings({ active: JSON.parse(fields.active), symbol: fields.symbol, timeframe: fields.timeframe,
      minConfidence: Number(fields.minConfidence),
      patterns: Object.fromEntries(Object.keys(PATTERNS).map((id) => [id, JSON.parse(fields[`pattern:${id}`])])) }, provider);
  }
  async function setSetting(field, value, updateId, messageDate = 0) {
    const settings = await getSettings();
    if (field.startsWith('pattern:') && Object.hasOwn(PATTERNS, field.slice(8))) {
      settings.patterns = { ...settings.patterns, [field.slice(8)]: value };
    } else if (['active', 'symbol', 'timeframe', 'minConfidence'].includes(field)) {
      settings[field] = value;
    } else { throw new Error('Campo de configuración inválido'); }
    validateSettings(settings, provider);
    if (!Number.isSafeInteger(updateId) || updateId < 0) throw new Error('Update ID inválido');
    if (!Number.isSafeInteger(messageDate) || messageDate < 0) throw new Error('Fecha inválida');
    const stored = typeof value === 'string' ? value : JSON.stringify(value);
    return Boolean(await evalScript(SCRIPTS.setting, [key('settings'), key('versions')], [field, stored, updateId, messageDate]));
  }
  async function claim(name, ttl = 180) {
    const token = randomUUID();
    return await command(['SET', key(name), token, 'NX', 'EX', ttl]) === 'OK' ? token : null;
  }
  async function reserveAlert(identity, group, confirmation = 0) {
    const token = randomUUID(), keys = [key(`signal:${hash(identity)}`), key(`cooldown:${hash(group)}`), key(`watermark:${hash(group)}`)];
    const result = await evalScript(SCRIPTS.alert, keys, [token, config.signalRetentionSeconds, config.cooldownSeconds, confirmation]);
    return Array.isArray(result) && result[0] === 1 ? { token, keys, previous: result[1] } : null;
  }
  return {
    getSettings, setSetting, claim,
    claimState: (name) => command(['GET', key(name)]),
    release: (name, token) => evalScript(SCRIPTS.release, [key(name)], [token]),
    complete: (name, token) => evalScript(SCRIPTS.complete, [key(name)], [token, 7 * 86400]),
    reserveAlert,
    cancelAlert: ({ keys, token, previous }) => evalScript(SCRIPTS.cancelAlert, keys, [token, previous]),
    recordAlert: (alert) => evalScript(SCRIPTS.alertStats, [key('stats')], [JSON.stringify(alert)]),
    recordScan: (scan) => evalScript(SCRIPTS.scanStats, [key('stats')], [JSON.stringify(scan), scan.errors ?? 0]),
    async getStats() {
      const values = await command(['HGETALL', key('stats')]);
      if (!Array.isArray(values)) throw new Error('Estadísticas inválidas');
      const fields = Object.fromEntries(Array.from({ length: values.length / 2 }, (_, i) => [values[i * 2], values[i * 2 + 1]]));
      return { scans: Number(fields.scans ?? 0), errors: Number(fields.errors ?? 0), alertsSent: Number(fields.alertsSent ?? 0),
        lastScan: fields.lastScan ? JSON.parse(fields.lastScan) : null, lastAlert: fields.lastAlert ? JSON.parse(fields.lastAlert) : null };
    },
  };
}
export const storage = createStorage();

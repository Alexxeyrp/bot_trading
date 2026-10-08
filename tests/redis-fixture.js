import { LuaFactory } from 'wasmoon';
import { createStorage } from '../src/services/storage.js';
import config from '../src/config.js';

// Ejecuta los scripts Lua reales con comandos Redis y reloj controlados, sin red.
export async function redisFixture(t, defaults = { ...config.defaults, active: true }) {
  const lua = await new LuaFactory().createEngine({ injectObjects: true });
  t.after(() => lua.global.close());
  lua.global.set('cjson', { decode: JSON.parse });
  await lua.doString(`
    db = {}; expires = {}; now = 0
    redis = {}
    redis.call = function(command, ...)
      local args = {...}; local key = args[1]; command = string.upper(command)
      if expires[key] and expires[key] <= now then db[key] = nil; expires[key] = nil end
      if command == 'SET' then
        for i = 3, #args do
          if args[i] == 'NX' and db[key] ~= nil then return false end
        end
        db[key] = tostring(args[2]); expires[key] = nil
        for i = 3, #args do if args[i] == 'EX' then expires[key] = now + tonumber(args[i+1]) end end
        return 'OK'
      end
      if command == 'GET' then return db[key] or false end
      if command == 'EXISTS' then return db[key] ~= nil and 1 or 0 end
      if command == 'DEL' then
        local existed = db[key] ~= nil; db[key] = nil; expires[key] = nil
        return existed and 1 or 0
      end
      local fields = db[key] or {}
      if command == 'HGET' then return fields[args[2]] or false end
      if command == 'HGETALL' then
        local values = {}
        for field, value in pairs(fields) do table.insert(values, field); table.insert(values, value) end
        return values
      end
      if command == 'HSETNX' then
        if fields[args[2]] ~= nil then return 0 end
        fields[args[2]] = tostring(args[3]); db[key] = fields; return 1
      end
      if command == 'HSET' then
        for i=2,#args,2 do fields[args[i]] = tostring(args[i+1]) end
        db[key] = fields; return 1
      end
      if command == 'HINCRBY' then
        fields[args[2]] = tostring(tonumber(fields[args[2]] or '0') + tonumber(args[3]))
        db[key] = fields; return tonumber(fields[args[2]])
      end
      error('Unsupported command: ' .. command)
    end
  `);
  let queued = Promise.resolve();
  const enqueue = (fn) => {
    const task = queued.then(fn);
    queued = task.catch(() => {});
    return task;
  };
  const transport = (_url, options) => enqueue(async () => {
    const [command, ...args] = JSON.parse(options.body);
    let result;
    if (command === 'EVAL') {
      const [script, count, ...values] = args;
      lua.global.set('KEYS', values.slice(0, count));
      lua.global.set('ARGV', values.slice(count).map(String));
      result = await lua.doString(script);
    } else {
      lua.global.set('commandArgs', [command, ...args]);
      result = await lua.doString('return redis.call(table.unpack(commandArgs))');
    }
    if (result && typeof result === 'object' && !Array.isArray(result)) result = Object.values(result);
    return { result: result === false || result === undefined ? null : result };
  });
  return {
    transport,
    store: createStorage({ url: 'https://test.invalid', token: 'test', prefix: 'fixture' }, defaults, 'binance', transport),
    advance: (seconds) => enqueue(async () => { await lua.doString(`now = now + ${seconds}`); }),
  };
}

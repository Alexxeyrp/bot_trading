import { timingSafeEqual } from 'node:crypto';
export function secretMatches(actual, expected) {
  if (typeof actual !== 'string' || typeof expected !== 'string' || !expected) return false;
  const a = Buffer.from(actual), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
export function respond(res, status, body) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).json(body);
}
export async function requestJson(url, options = {}, timeout = 8000) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(timeout) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

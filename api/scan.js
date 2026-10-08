import { secretMatches, respond } from '../src/utils/http.js';
export default async function handler(req, res) {
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return respond(res, 405, { error: 'Method not allowed' }); }
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) return respond(res, 503, { error: 'Service not configured' });
  if (!secretMatches(req.headers.authorization, `Bearer ${secret}`)) {
    console.warn('Unauthorized scan request');
    return respond(res, 401, { error: 'Unauthorized' });
  }
  try {
    const { scan } = await import('../src/services/scanner.js');
    const result = await scan();
    return respond(res, result.status === 'partial' ? 503 : 200, result);
  } catch {
    console.error('Scan request failed; check configuration, market and storage');
    return respond(res, 503, { error: 'Scan unavailable' });
  }
}

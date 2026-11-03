// MakerLens feedback endpoint (Cloudflare Worker + D1).
//
//   POST /api/feedback            — public, only from ALLOWED_ORIGINS
//   GET  /api/feedback/summary    — Authorization: Bearer <ADMIN_TOKEN> → JSON
//   GET  /api/feedback/export.csv — Authorization: Bearer <ADMIN_TOKEN> → CSV
//
// Privacy rules (mirrored in privacy.html — keep both in sync):
//   - Store only what the form sends after validation: kind, rating, comment,
//     2-letter language, a usage bucket and (if the user ticked it) browser + OS.
//   - Never store IP, user agent, headers, cookies or any identifier; the date
//     is stored without time of day. The IP is only used as the in-memory key of
//     the rate limiter binding.
//   - No console.log of requests (observability is off in wrangler.toml).

const MAX_BODY    = 8 * 1024;
const MAX_COMMENT = 1000;
const KINDS       = new Set(['rating', 'idea', 'bug']);
const OPENS       = new Set(['', '1', '2', '3-5', '6-10', '11+']);
const LANG_RE     = /^(?:[a-z]{2})?$/;
// e.g. "Chrome 131 · Windows" — letters, digits, spaces, dots, the separator.
const BROWSER_RE  = /^[\p{L}\p{N} .·()/_-]{0,60}$/u;

const origins = env => (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);

function cors(req, env) {
  const origin = req.headers.get('Origin') || '';
  if (!origins(env).includes(origin)) return null;
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  });

// Returns a clean row, or a string describing the first problem.
export function validate(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return 'body must be a JSON object';
  const kind    = input.kind ?? 'rating';
  const rating  = input.rating ?? null;
  const comment = typeof input.comment === 'string' ? input.comment.trim() : (input.comment ?? '');
  const lang    = input.lang ?? '';
  const opens   = input.opens ?? '';
  const browser = input.browser ?? '';

  if (!KINDS.has(kind)) return 'invalid kind';
  if (rating !== null && !(Number.isInteger(rating) && rating >= 1 && rating <= 5)) return 'invalid rating';
  if (kind === 'rating' && rating === null) return 'rating required';
  if (typeof comment !== 'string' || comment.length > MAX_COMMENT) return 'invalid comment';
  if (kind !== 'rating' && !comment) return 'comment required';
  if (typeof lang !== 'string' || !LANG_RE.test(lang)) return 'invalid lang';
  if (typeof opens !== 'string' || !OPENS.has(opens)) return 'invalid opens';
  if (typeof browser !== 'string' || !BROWSER_RE.test(browser)) return 'invalid browser';
  return { kind, rating, comment, lang, opens, browser };
}

async function submit(req, env) {
  const headers = cors(req, env);
  if (!headers) return json({ error: 'origin not allowed' }, 403);

  const len = Number(req.headers.get('Content-Length') || 0);
  if (len > MAX_BODY) return json({ error: 'too large' }, 413, headers);
  const raw = await req.text();
  if (raw.length > MAX_BODY) return json({ error: 'too large' }, 413, headers);

  let input;
  try { input = JSON.parse(raw); } catch { return json({ error: 'invalid JSON' }, 400, headers); }

  // Honeypot: a hidden field real users never fill. Pretend success to bots.
  if (input && input.website) return new Response(null, { status: 204, headers });

  if (env.RATE_LIMITER) {
    const ip = req.headers.get('CF-Connecting-IP') || 'unknown';
    const { success } = await env.RATE_LIMITER.limit({ key: ip });
    if (!success) return json({ error: 'too many requests' }, 429, headers);
  }

  const row = validate(input);
  if (typeof row === 'string') return json({ error: row }, 400, headers);

  const day = new Date().toISOString().slice(0, 10);
  await env.DB.prepare(
    'INSERT INTO feedback (created_day, kind, rating, comment, lang, opens, browser) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(day, row.kind, row.rating, row.comment, row.lang, row.opens, row.browser).run();

  return new Response(null, { status: 204, headers });
}

// Constant-time comparison of the bearer token.
function authorized(req, env) {
  const token = env.ADMIN_TOKEN || '';
  const got = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token || got.length !== token.length) return false;
  let diff = 0;
  for (let i = 0; i < token.length; i++) diff |= token.charCodeAt(i) ^ got.charCodeAt(i);
  return diff === 0;
}

async function summary(env) {
  const [totals, stars, byKind, latest] = await env.DB.batch([
    env.DB.prepare("SELECT COUNT(*) AS ratings, ROUND(AVG(rating), 2) AS average FROM feedback WHERE kind = 'rating'"),
    env.DB.prepare("SELECT rating, COUNT(*) AS n FROM feedback WHERE kind = 'rating' GROUP BY rating"),
    env.DB.prepare('SELECT kind, COUNT(*) AS n FROM feedback GROUP BY kind'),
    env.DB.prepare("SELECT id, created_day, kind, rating, lang, opens, browser, comment FROM feedback WHERE comment <> '' ORDER BY id DESC LIMIT 50"),
  ]);
  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const r of stars.results) distribution[r.rating] = r.n;
  return json({
    ratings: totals.results[0].ratings,
    average: totals.results[0].average,
    distribution,
    byKind: Object.fromEntries(byKind.results.map(r => [r.kind, r.n])),
    latestComments: latest.results,
  });
}

const csvCell = v => {
  const s = v === null || v === undefined ? '' : String(v);
  // Prefix formula-looking cells so spreadsheets do not execute them.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

async function exportCsv(env) {
  const { results } = await env.DB.prepare(
    'SELECT id, created_day, kind, rating, lang, opens, browser, comment FROM feedback ORDER BY id'
  ).all();
  const cols = ['id', 'created_day', 'kind', 'rating', 'lang', 'opens', 'browser', 'comment'];
  const lines = [cols.join(','), ...results.map(r => cols.map(c => csvCell(r[c])).join(','))];
  return new Response('﻿' + lines.join('\r\n'), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="makerlens-feedback.csv"',
      'Cache-Control': 'no-store',
    },
  });
}

export default {
  async fetch(req, env) {
    const { pathname } = new URL(req.url);

    if (pathname === '/api/feedback') {
      if (req.method === 'OPTIONS') {
        const headers = cors(req, env);
        return new Response(null, { status: headers ? 204 : 403, headers: headers || {} });
      }
      if (req.method === 'POST') return submit(req, env);
      return json({ error: 'method not allowed' }, 405, { Allow: 'POST, OPTIONS' });
    }

    if (pathname === '/api/feedback/summary' || pathname === '/api/feedback/export.csv') {
      if (req.method !== 'GET') return json({ error: 'method not allowed' }, 405, { Allow: 'GET' });
      if (!authorized(req, env)) return json({ error: 'unauthorized' }, 401);
      return pathname.endsWith('.csv') ? exportCsv(env) : summary(env);
    }

    return json({ error: 'not found' }, 404);
  },
};

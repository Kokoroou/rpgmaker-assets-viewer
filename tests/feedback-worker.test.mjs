// Tests for the feedback Worker (feedback-worker/src/index.js) with a fake D1 and
// rate limiter. Checks validation, Origin gating, the honeypot, and that nothing
// beyond the validated fields (no IP, no user agent) reaches the database.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import worker, { validate } from '../feedback-worker/src/index.js';

const ORIGIN = 'https://kokoroou.github.io';

function fakeEnv({ limited = false } = {}) {
  const rows = [];
  const DB = {
    prepare(sql) {
      return {
        bind(...args) { this.args = args; return this; },
        async run() { rows.push({ sql, args: this.args }); },
      };
    },
  };
  return {
    rows,
    env: {
      ALLOWED_ORIGINS: ORIGIN, ADMIN_TOKEN: 'secret', DB,
      RATE_LIMITER: { limit: async () => ({ success: !limited }) },
    },
  };
}

const post = (body, origin = ORIGIN) => new Request('https://w.example/api/feedback', {
  method: 'POST',
  headers: { 'Content-Type': 'text/plain', Origin: origin, 'CF-Connecting-IP': '203.0.113.7', 'User-Agent': 'UA/1.0' },
  body: typeof body === 'string' ? body : JSON.stringify(body),
});

test('validate accepts a rating with optional comment', () => {
  assert.deepEqual(validate({ kind: 'rating', rating: 5, comment: '  great ', lang: 'vi', opens: '2' }),
    { kind: 'rating', rating: 5, comment: 'great', lang: 'vi', opens: '2', browser: '' });
});

test('validate rejects bad input', () => {
  assert.equal(validate({ kind: 'rating' }), 'rating required');
  assert.equal(validate({ rating: 6 }), 'invalid rating');
  assert.equal(validate({ rating: 2.5 }), 'invalid rating');
  assert.equal(validate({ kind: 'bug', comment: '' }), 'comment required');
  assert.equal(validate({ kind: 'spam', rating: 1 }), 'invalid kind');
  assert.equal(validate({ rating: 3, comment: 'x'.repeat(1001) }), 'invalid comment');
  assert.equal(validate({ rating: 3, lang: 'vi-VN' }), 'invalid lang');
  assert.equal(validate({ rating: 3, opens: '42' }), 'invalid opens');
  assert.equal(validate({ rating: 3, browser: '<script>' }), 'invalid browser');
  assert.equal(validate([]), 'body must be a JSON object');
});

test('stores only validated fields, with the day and no IP or user agent', async () => {
  const { env, rows } = fakeEnv();
  const res = await worker.fetch(post({ kind: 'bug', comment: 'audio fails', lang: 'en', opens: '3-5',
    browser: 'Chrome 131 · Windows', extra: 'ignored' }), env);
  assert.equal(res.status, 204);
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  assert.equal(rows.length, 1);
  const [day, ...rest] = rows[0].args;
  assert.match(day, /^\d{4}-\d{2}-\d{2}$/);
  assert.deepEqual(rest, ['bug', null, 'audio fails', 'en', '3-5', 'Chrome 131 · Windows']);
  assert.ok(!JSON.stringify(rows).includes('203.0.113.7'));
  assert.ok(!JSON.stringify(rows).includes('UA/1.0'));
});

test('rejects other origins, bad JSON, rate-limited clients; honeypot is silent', async () => {
  let { env, rows } = fakeEnv();
  assert.equal((await worker.fetch(post({ rating: 4 }, 'https://evil.example'), env)).status, 403);
  assert.equal((await worker.fetch(post('{nope'), env)).status, 400);
  assert.equal((await worker.fetch(post({ rating: 4, website: 'http://spam' }), env)).status, 204);
  assert.equal(rows.length, 0);
  ({ env, rows } = fakeEnv({ limited: true }));
  assert.equal((await worker.fetch(post({ rating: 4 }), env)).status, 429);
  assert.equal(rows.length, 0);
});

test('read endpoints need the admin token', async () => {
  const { env } = fakeEnv();
  const res = await worker.fetch(new Request('https://w.example/api/feedback/summary'), env);
  assert.equal(res.status, 401);
  const wrong = await worker.fetch(new Request('https://w.example/api/feedback/export.csv',
    { headers: { Authorization: 'Bearer nope!!' } }), env);
  assert.equal(wrong.status, 401);
});

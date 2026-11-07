import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const ctx = vm.createContext({ URL, URLSearchParams, File, encodeURIComponent, Error, JSON, String, Object });
vm.runInContext(readFileSync(new URL('../js/remote.js', import.meta.url), 'utf8') + '\n;this.Remote = Remote; this.RemoteError = RemoteError;', ctx, { filename: 'remote.js' });
const { Remote } = ctx;

const TOKEN = 'aabbccddeeff.' + 's'.repeat(32);
const LINK = `https://makerlens.kokoroou.workers.dev/assets/#game=${encodeURIComponent('https://my-game.alice.workers.dev')}&t=${TOKEN}`;

const code = fn => { try { fn(); } catch (e) { return e.code; } return null; };

test('parseLink: a link from rwk lens, whole or just its # part', () => {
  const want = { origin: 'https://my-game.alice.workers.dev', token: TOKEN };
  assert.deepEqual({ ...Remote.parseLink(LINK) }, want);
  assert.deepEqual({ ...Remote.parseLink(LINK.slice(LINK.indexOf('#'))) }, want);
  assert.deepEqual({ ...Remote.parseLink(`  ${LINK}\n`) }, want, 'pasted with spaces and a newline');
  assert.deepEqual({ ...Remote.parseLink(LINK.replace('/assets/', '/events/')) }, want, 'either viewer’s link works in both');
});

test('parseLink: only https workers.dev games, a well-formed token, no credentials', () => {
  const link = game => `https://x/#game=${encodeURIComponent(game)}&t=${TOKEN}`;
  for (const bad of ['http://my-game.alice.workers.dev', 'https://example.com', 'https://evil.com/.workers.dev', 'https://workers.dev.evil.com', 'https://user:pw@my-game.alice.workers.dev', 'not a url', 'https://127.0.0.1']) {
    assert.equal(code(() => Remote.parseLink(link(bad))), 'link', bad);
  }
  assert.equal(code(() => Remote.parseLink('')), 'link');
  assert.equal(code(() => Remote.parseLink('https://makerlens.kokoroou.workers.dev/assets/')), 'link');
  assert.equal(code(() => Remote.parseLink(`https://x/#game=https%3A%2F%2Fg.alice.workers.dev&t=short`)), 'link');
  assert.equal(code(() => Remote.parseLink(`https://x/#game=https%3A%2F%2Fg.alice.workers.dev&t=${TOKEN}%0A`)), 'link', 'no control characters in the token');
});

test('fromLocation: a link in the address, or nothing, never an error', () => {
  assert.equal(Remote.fromLocation(''), null);
  assert.equal(Remote.fromLocation('#faq'), null);
  assert.equal(Remote.fromLocation('#game=oops&t=x'), null);
  assert.equal(Remote.fromLocation(LINK.slice(LINK.indexOf('#'))).origin, 'https://my-game.alice.workers.dev');
});

function api(handler) {
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push([url, init]); return handler(url, init); };
  return { calls, c: Remote.client(Remote.parseLink(LINK), fetchImpl) };
}

test('client: sends the token as a header, no cookies, and reads files by path', async () => {
  const { calls, c } = api(url => url.endsWith('/ping') ? Response.json({ ok: true }) : new Response('bytes'));
  assert.equal(c.host, 'my-game.alice.workers.dev');
  await c.ping();
  const file = await c.file('img/pictures/大 图.png_');
  assert.equal(file.name, '大 图.png_');
  assert.equal(await file.text(), 'bytes');
  assert.equal(calls[0][0], 'https://my-game.alice.workers.dev/_lens/ping');
  assert.equal(calls[1][0], 'https://my-game.alice.workers.dev/_lens/file/img/pictures/%E5%A4%A7%20%E5%9B%BE.png_');
  for (const [, init] of calls) {
    assert.equal(init.headers.authorization, `Bearer ${TOKEN}`);
    assert.equal(init.credentials, 'omit');
    assert.equal(init.redirect, 'manual');
  }
});

test('client: says what is wrong in words', async () => {
  const fail = async (res) => {
    const { c } = api(() => res instanceof Error ? Promise.reject(res) : res);
    try { await c.ping(); } catch (e) { return e; }
  };
  assert.equal((await fail(new Response('', { status: 401 }))).code, 'expired');
  assert.equal((await fail(new Response('', { status: 404 }))).code, 'missing');
  assert.equal((await fail(new Response('', { status: 500 }))).code, 'http');
  assert.equal((await fail(new TypeError('Failed to fetch'))).code, 'network');
  assert.equal((await fail({ type: 'opaqueredirect', status: 0, ok: false })).code, 'access');
  assert.match((await fail(new Response('', { status: 401 }))).message, /expired or was stopped/);
});

test('client: a manifest without files is refused', async () => {
  const { c } = api(() => Response.json({ title: 'x' }));
  await assert.rejects(c.manifest(), /not readable/);
  const ok = api(() => Response.json({ title: 'x', engine: 'MZ', files: { 'img/a.png_': 1 } }));
  assert.deepEqual({ ...(await ok.c.manifest()).files }, { 'img/a.png_': 1 });
});

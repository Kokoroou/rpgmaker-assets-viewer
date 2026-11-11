import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// A tiny IndexedDB: just open / createObjectStore / transaction / put / get / delete.
function fakeIDB() {
  const stores = new Map();
  const later = fn => setTimeout(fn, 0);
  return {
    stores,
    open() {
      const req = {};
      later(() => {
        req.result = {
          objectStoreNames: { contains: n => stores.has(n) },
          createObjectStore: n => stores.set(n, new Map()),
          close() {},
          transaction(name) {
            const tx = {}, map = stores.get(name);
            later(() => later(() => tx.oncomplete && tx.oncomplete()));   // after the requests below
            tx.objectStore = () => ({
              put: (v, k) => { map.set(k, v); },
              delete: k => { map.delete(k); },
              get: k => { const r = {}, v = map.get(k); later(() => { r.result = v; r.onsuccess && r.onsuccess(); }); return r; },   // value as of the call, like IndexedDB
            });
            return tx;
          },
        };
        if (!stores.size) req.onupgradeneeded && req.onupgradeneeded();
        req.onsuccess && req.onsuccess();
      });
      return req;
    },
  };
}

function session() {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) };
}

function world() {
  const g = { indexedDB: fakeIDB(), sessionStorage: session(), Promise, Date, setTimeout, Object, Error, RegExp, Array };
  const ctx = vm.createContext(g);
  vm.runInContext(readFileSync(new URL('../js/handoff.js', import.meta.url), 'utf8') + '\n;this.Handoff = Handoff;', ctx, { filename: 'handoff.js' });
  return { Handoff: ctx.Handoff, g };
}

const dir = name => ({ kind: 'directory', name });

test('peerURL: the other tool next to this one, only when both are served side by side', () => {
  const { Handoff } = world();
  assert.equal(Handoff.peerURL('events', '/assets/'), '/events/');
  assert.equal(Handoff.peerURL('events', '/assets/index.html'), '/events/');
  assert.equal(Handoff.peerURL('assets', '/events/'), '/assets/');
  assert.equal(Handoff.peerURL('assets', '/x/y/events/index.html'), '/x/y/assets/');
  assert.equal(Handoff.peerURL('events', '/rpgmaker-assets-viewer/'), null, 'GitHub Pages copy');
  assert.equal(Handoff.peerURL('events', '/'), null, 'a local copy of one tool');
  assert.equal(Handoff.peerURL('video', '/assets/'), null);
});

test('ready needs IndexedDB and a pair', () => {
  const { Handoff, g } = world();
  assert.equal(Handoff.ready('events', '/assets/', g), true);
  assert.equal(Handoff.ready('events', '/', g), false);
  assert.equal(Handoff.ready('events', '/assets/', {}), false);
});

test('send then receive hands the handle over once and leaves nothing behind', async () => {
  const { Handoff, g } = world();
  const h = dir('My Game');
  await Handoff.send(h, g, 1000);
  assert.equal(g.sessionStorage.getItem('ml-handoff'), '1');
  assert.equal(await Handoff.receive(g, 1500), h);
  assert.equal(g.sessionStorage.getItem('ml-handoff'), null, 'the flag is cleared');
  assert.equal(g.indexedDB.stores.get('folder').size, 0, 'the stored handle is deleted');
  assert.equal(await Handoff.receive(g, 1600), null, 'a second page load gets nothing');
});

test('a normal visit (no flag) never opens IndexedDB', async () => {
  const { Handoff, g } = world();
  let opened = 0;
  const open = g.indexedDB.open; g.indexedDB.open = (...a) => { opened++; return open(...a); };
  assert.equal(await Handoff.receive(g), null);
  assert.equal(opened, 0);
});

test('a handle nobody took in time is dropped, and so is anything that is not a directory', async () => {
  const a = world();
  await a.Handoff.send(dir('Old'), a.g, 0);
  assert.equal(await a.Handoff.receive(a.g, 3 * 60 * 1000), null);
  assert.equal(a.g.indexedDB.stores.get('folder').size, 0, 'stale handles are deleted too');
  const b = world();
  await b.Handoff.send({ kind: 'file', name: 'x' }, b.g, 0);
  assert.equal(await b.Handoff.receive(b.g, 10), null);
});

test('send fails cleanly when the browser has no IndexedDB', async () => {
  const { Handoff } = world();
  await assert.rejects(Handoff.send(dir('G'), { sessionStorage: session() }), /IndexedDB/);
});

test('permission: asks only when told to, and a refusal is not an error', async () => {
  const { Handoff } = world();
  const mk = (query, request) => ({ queryPermission: async () => query, requestPermission: async () => request });
  assert.equal(await Handoff.permission(mk('granted', 'denied'), false), 'granted');
  assert.equal(await Handoff.permission(mk('prompt', 'granted'), false), 'prompt', 'no click, no prompt');
  assert.equal(await Handoff.permission(mk('prompt', 'granted'), true), 'granted');
  assert.equal(await Handoff.permission(mk('prompt', 'denied'), true), 'denied');
  assert.equal(await Handoff.permission({ queryPermission: async () => { throw new Error('x'); } }, true), 'denied');
});

// Identical-content grouping (roadmap item 8). Synthetic bytes only.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const ctx = vm.createContext({ crypto: globalThis.crypto });
vm.runInContext(readFileSync(new URL('../js/dupes.js', import.meta.url), 'utf8'), ctx, { filename: 'dupes.js' });
const js = vm.runInContext('({ sha256Hex, dupeGroups, uniquePaths, dupeList, Dupes })', ctx);
const plain = o => JSON.parse(JSON.stringify(o));

test('sha256Hex matches the known digest of "abc"', async () => {
  assert.equal(await js.sha256Hex(new TextEncoder().encode('abc')),
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(await js.sha256Hex(new Uint8Array(0)),
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
});

test('identical bytes hash the same, one changed byte does not', async () => {
  const a = new Uint8Array([1, 2, 3, 4, 5]), b = a.slice(), c = a.slice();
  c[4] = 6;
  assert.equal(await js.sha256Hex(a), await js.sha256Hex(b));
  assert.notEqual(await js.sha256Hex(a), await js.sha256Hex(c));
});

const hashes = new Map([
  ['img/pictures/a.png', 'h1'],
  ['img/pictures/b.png', 'h2'],
  ['img/pictures/copy.png', 'h1'],
  ['img/parallaxes/a.png', 'h1'],
  ['audio/se/x.ogg', 'h3'],
  ['audio/bgs/x.ogg', 'h3'],
]);

test('dupeGroups keeps only contents found at 2+ paths', () => {
  const g = js.dupeGroups(hashes);
  assert.deepEqual([...g.keys()].sort(), ['h1', 'h3']);
  assert.deepEqual(plain(g.get('h1')), ['img/pictures/a.png', 'img/pictures/copy.png', 'img/parallaxes/a.png']);
});

test('uniquePaths keeps the first of each content and every unhashed path', () => {
  const paths = ['img/pictures/a.png', 'img/pictures/copy.png', 'img/pictures/b.png', 'img/pictures/new.png'];
  assert.deepEqual(plain(js.uniquePaths(paths, hashes)), ['img/pictures/a.png', 'img/pictures/b.png', 'img/pictures/new.png']);
  assert.deepEqual(plain(js.uniquePaths([], hashes)), []);
});

test('dupeList puts each group together, groups and members sorted', () => {
  assert.deepEqual(plain(js.dupeList(js.dupeGroups(hashes))), [
    'audio/bgs/x.ogg', 'audio/se/x.ogg',
    'img/parallaxes/a.png', 'img/pictures/a.png', 'img/pictures/copy.png',
  ]);
});

test('Dupes counts every path that has a copy', () => {
  const d = js.Dupes;
  for (const [p, h] of hashes) d._add(p, h);
  assert.equal(d.copies, 5);
  assert.deepEqual(plain(d.copiesOf('img/pictures/b.png')), []);
  assert.deepEqual(plain(d.copiesOf('audio/se/x.ogg')), ['audio/bgs/x.ogg']);
  assert.equal(d.list().length, 5);
});

test('start() spawns a fixed number of workers even when they exit at once', () => {
  // A worker with nothing to do returns synchronously; start() used to respawn it forever.
  ctx.S = { files: new Map([['a.png', {}]]), folders: new Map(), currentFolder: null };
  let calls = 0;
  js.Dupes._changed = () => {};
  js.Dupes._work = function () {
    if (++calls > 50) throw new Error('respawn loop');
    this.workers--;
  };
  js.Dupes.start();
  assert.equal(calls, 2);
});

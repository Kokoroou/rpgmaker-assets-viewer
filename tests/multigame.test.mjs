// Several games in one folder: per-game keys and the img/pictures start folder. Synthetic bytes only.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const ctx = vm.createContext({ $: () => null, document: null, performance, setTimeout, clearTimeout });
for (const f of ['constants.js', 'state.js', 'decrypt-mvmz.js'])
  vm.runInContext(readFileSync(new URL(`../js/${f}`, import.meta.url), 'utf8'), ctx, { filename: f });
// Only the key helpers of ui.js (the rest needs a DOM).
const ui = readFileSync(new URL('../js/ui.js', import.meta.url), 'utf8');
const from = ui.indexOf('// Encryption key for a file.'), to = ui.indexOf('function clearBlobCache');
vm.runInContext(ui.slice(from, to), ctx);
vm.runInContext(readFileSync(new URL('../js/scan.js', import.meta.url), 'utf8').split('// ─── Background loading UI')[0],
  Object.assign(ctx, { Fg: { active: false }, S: ctx.S }), { filename: 'scan.js' });
const js = vm.runInContext('({ S, keyFor, decryptWithKey, gameFolderOf, FolderScan, PICTURES_DIR, decryptMVMZ, RPG_HEADER })', ctx);

const hex = b => Buffer.from(b).toString('hex');
const keyA = 'aa'.repeat(16), keyB = '0123456789abcdef0123456789abcdef';
const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 1, 2, 3];
const encrypt = (key, plain) => {
  const out = [...js.RPG_HEADER, ...plain], k = Buffer.from(key, 'hex');
  for (let i = 0; i < 16; i++) out[16 + i] ^= k[i];
  return new Uint8Array(out).buffer;
};

test('keyFor picks the deepest game folder, S.key is the fallback', () => {
  js.S.key = 'fallback';
  js.S.keys = new Map([['Root/A/www', keyA], ['Root/B', keyB], ['Root/B/sub', 'cc'.repeat(16)]]);
  assert.equal(js.keyFor('Root/A/www/img/pictures/x.rpgmvp'), keyA);
  assert.equal(js.keyFor('Root/B/img/x.rpgmvp'), keyB);
  assert.equal(js.keyFor('Root/B/sub/img/x.rpgmvp'), 'cc'.repeat(16));
  assert.equal(js.keyFor('Root/A/www2/x.rpgmvp'), 'fallback', 'prefix must end at a folder boundary');
});

test('decryptWithKey uses the key of the file\'s own game', () => {
  js.S.key = '';
  js.S.keys = new Map([['R/A/www', keyA], ['R/B/www', keyB]]);
  for (const [g, key] of [['A', keyA], ['B', keyB]]) {
    const out = new Uint8Array(js.decryptWithKey(encrypt(key, png), `R/${g}/www/img/pictures/p.rpgmvp`));
    assert.equal(hex(out.slice(0, 8)), '89504e470d0a1a0a');
  }
});

test('a derived key is remembered for that game only', () => {
  js.S.key = '';
  js.S.keys = new Map();
  js.decryptWithKey(encrypt(keyA, png), 'R/A/www/img/pictures/p.rpgmvp');
  assert.equal(js.S.keys.get('R/A'), keyA);
  assert.equal(js.S.key, '');
  assert.equal(js.gameFolderOf('loose.rpgmvp'), null);
});

test('PICTURES_DIR matches img/pictures at any depth only', () => {
  for (const p of ['img/pictures', 'www/img/pictures', 'G/www/img/Pictures']) assert.ok(js.PICTURES_DIR.test(p), p);
  for (const p of ['img/pictures/sub', 'img/pictures2', 'audio/pictures', 'xpictures']) assert.ok(!js.PICTURES_DIR.test(p), p);
});

// Fake directory API: dir = { n, kids }, file = { n, text }.
const fs = {
  list: async d => d.kids, isDir: h => !!h.kids, name: h => h.n,
  file: async h => ({ text: async () => h.text, size: 1 }),
};
const dir = (n, ...kids) => ({ n, kids }), file = (n, text = '') => ({ n, text });
const game = (n, key) => dir(n, dir('www', dir('data', file('System.json', JSON.stringify({ encryptionKey: key }))),
  dir('img', dir('pictures', file('a.rpgmvp')), dir('characters', file('b.rpgmvp')))));

test('FolderScan reads one key per game and lists img/pictures first', async () => {
  const root = dir('Games', game('A', keyA), dir('stuff', game('B', keyB)));
  const scan = new js.FolderScan(fs, 'Games');
  const found = [];
  scan.onKey = k => found.push(k);
  scan.start(root.kids);
  while (!scan.listed) await new Promise(r => setTimeout(r, 5));
  await new Promise(r => setTimeout(r, 20));
  assert.equal(JSON.stringify([...scan.keys].sort()), JSON.stringify([['Games/A/www', keyA], ['Games/stuff/B/www', keyB]]));
  assert.equal(found.length, 2);
  assert.ok(scan.folders.has('A/www/img/pictures') && scan.folders.has('stuff/B/www/img/pictures'));
  scan.abort();
});

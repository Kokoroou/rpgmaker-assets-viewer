// Key recovery, ZIP name sanitizing and malformed-archive tests. Synthetic bytes only.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const ctx = vm.createContext({ TextDecoder, TextEncoder });
for (const f of ['constants.js', 'decrypt-mvmz.js', 'decrypt-rgssad.js'])
  vm.runInContext(readFileSync(new URL(`../js/${f}`, import.meta.url), 'utf8'), ctx, { filename: f });
const js = vm.runInContext(
  '({ RPG_HEADER, decryptMVMZ, deriveKeyFromPNG, sanitizeFileName, uniqueZipNames, parseRGSSAD })', ctx);

const PNG16 = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49, 0x48, 0x44, 0x52];
const KEY = Array.from({ length: 16 }, (_, i) => (i * 17 + 5) & 0xff);
const hex = a => a.map(b => b.toString(16).padStart(2, '0')).join('');

function fakeEncryptedPng(key = KEY) {
  const body = [...PNG16, 1, 2, 3, 4];
  const u = new Uint8Array(16 + body.length);
  u.set(js.RPG_HEADER, 0);
  body.forEach((b, i) => { u[16 + i] = i < 16 ? b ^ key[i] : b; });
  return u.buffer;
}

// ── key recovery ──
test('deriveKeyFromPNG recovers the key and it decrypts the file', () => {
  const buf = fakeEncryptedPng();
  const k = js.deriveKeyFromPNG(buf);
  assert.equal(k, hex(KEY));
  assert.deepEqual([...new Uint8Array(js.decryptMVMZ(buf, k))].slice(0, 16), PNG16);
});

test('deriveKeyFromPNG rejects non-encrypted, short and bad-header input', () => {
  assert.equal(js.deriveKeyFromPNG(new ArrayBuffer(10)), null);
  assert.equal(js.deriveKeyFromPNG(new Uint8Array(64).buffer), null);
  assert.equal(js.deriveKeyFromPNG(null), null);
});

// ── ZIP names ──
test('sanitizeFileName strips traversal, drives and forbidden characters', () => {
  assert.equal(js.sanitizeFileName('../../etc/passwd'), 'passwd');
  assert.equal(js.sanitizeFileName('C:\\Windows\\evil.png'), 'evil.png');
  assert.equal(js.sanitizeFileName('/abs/path/a.png'), 'a.png');
  assert.equal(js.sanitizeFileName('a<b>:c|d?.png'), 'a_b__c_d_.png');
  assert.equal(js.sanitizeFileName('..'), 'file');
  assert.equal(js.sanitizeFileName(''), 'file');
  assert.equal(js.sanitizeFileName('name.png. '), 'name.png');
  assert.equal(js.sanitizeFileName('CON.png'), '_CON.png');
  assert.equal(js.sanitizeFileName('a\u0000b.png'), 'a_b.png');
  assert.ok(js.sanitizeFileName('x'.repeat(500) + '.png').length <= 200);
});

test('uniqueZipNames de-duplicates case-insensitively', () => {
  assert.deepEqual([...js.uniqueZipNames(['a.png', 'A.PNG', 'x/a.png', 'b'])],
    ['a.png', 'A (2).PNG', 'a (3).png', 'b']);
});

// ── malformed archives ──
function rgssV1(entries, { truncate = 0 } = {}) {
  const out = [...Buffer.from('RGSSAD\0\x01')];
  let key = 0xDEADCAFE >>> 0;
  const int = v => { const x = (v ^ key) >>> 0; key = (key * 7 + 3) >>> 0;
    out.push(x & 255, (x >>> 8) & 255, (x >>> 16) & 255, x >>> 24); };
  for (const { name, size, data = [] } of entries) {
    int(name.length);
    for (const c of Buffer.from(name)) { out.push(c ^ (key & 255)); key = (key * 7 + 3) >>> 0; }
    int(size);
    out.push(...data);
  }
  return new Uint8Array(truncate ? out.slice(0, out.length - truncate) : out).buffer;
}

test('parseRGSSAD rejects bad magic, bad version and tiny files', () => {
  assert.throws(() => js.parseRGSSAD(new Uint8Array(4).buffer));
  assert.throws(() => js.parseRGSSAD(Buffer.from('NOTRGSSAD!!!!').buffer.slice(0, 13)));
  assert.throws(() => js.parseRGSSAD(new Uint8Array([...Buffer.from('RGSSAD\0\x02'), 0, 0, 0, 0]).buffer), /not supported/);
});

test('parseRGSSAD v1 parses good entries and stops at a size past the end', () => {
  const ok = js.parseRGSSAD(rgssV1([{ name: 'a/b.png', size: 3, data: [1, 2, 3] }]));
  assert.equal(ok.length, 1);
  assert.equal(ok[0].name, 'a/b.png');
  const bad = js.parseRGSSAD(rgssV1([
    { name: 'good.png', size: 2, data: [1, 2] },
    { name: 'huge.png', size: 0x7fffffff, data: [] },
  ]));
  assert.deepEqual([...bad].map(e => e.name), ['good.png']);
  const cut = js.parseRGSSAD(rgssV1([{ name: 'cut.png', size: 5, data: [1, 2, 3, 4, 5] }], { truncate: 2 }));
  assert.equal(cut.length, 0);
});

function rgssV3(entries, mKeyRaw = 0x12345678) {
  const mKey = (mKeyRaw * 9 + 3) >>> 0;
  const out = [...Buffer.from('RGSSAD\0\x03')];
  const w32 = v => out.push(v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255);
  w32(mKeyRaw);
  for (const { name, offset, size } of entries) {
    w32((offset ^ mKey) >>> 0); w32((size ^ mKey) >>> 0); w32((0 ^ mKey) >>> 0);
    w32((name.length ^ mKey) >>> 0);
    const mkb = [mKey & 255, (mKey >>> 8) & 255, (mKey >>> 16) & 255, mKey >>> 24];
    [...Buffer.from(name)].forEach((c, i) => out.push(c ^ mkb[i % 4]));
  }
  w32(0 ^ mKey); w32(0); w32(0); w32(0);
  return new Uint8Array(out).buffer;
}

test('parseRGSSAD v3 skips entries pointing outside the file and bounds name length', () => {
  const buf = rgssV3([
    { name: 'in.png', offset: 40, size: 4 },
    { name: 'out.png', offset: 0x7fffffff, size: 100 },
  ]);
  // make the first entry valid by ensuring the file is long enough
  const padded = new Uint8Array(buf.byteLength + 100); padded.set(new Uint8Array(buf));
  const names = [...js.parseRGSSAD(padded.buffer)].map(e => e.name);
  assert.deepEqual(names, ['in.png']);
  // absurd name length must not throw or hang
  const evil = new Uint8Array(buf.slice(0)); 
  assert.doesNotThrow(() => js.parseRGSSAD(evil.buffer.slice(0, 30)));
});

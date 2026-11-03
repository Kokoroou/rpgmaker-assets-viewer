// Unit tests for the pure decoding code (node --test tests/). The browser scripts share
// one global scope, so they are loaded into a vm context in the order index.html uses.
// All fixtures are synthetic bytes built here — never real game assets (see CLAUDE.md).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

function load(...files) {
  const ctx = vm.createContext({ TextDecoder, TextEncoder });
  for (const f of files) {
    vm.runInContext(readFileSync(new URL(`../js/${f}`, import.meta.url), 'utf8'), ctx, { filename: f });
  }
  // Top-level const/let live in the script scope, not on the global object: expose them.
  return vm.runInContext(
    '({ RPG_HEADER, EXT_REMAP, canonicalExt, getMimeType, MEDIA_EXT, escapeHtml, decryptMVMZ, parseRGSSAD, rgssDecryptData })',
    ctx);
}
const js = load('constants.js', 'decrypt-mvmz.js', 'decrypt-rgssad.js');
const enc = new TextEncoder();
const bytes = buf => [...new Uint8Array(buf)];

// ── constants ─────────────────────────────────────────────────────────────────
test('escapeHtml neutralizes markup in file and folder names', () => {
  assert.equal(js.escapeHtml('<img src=x onerror="alert(1)">.png'),
    '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;.png');
  assert.equal(js.escapeHtml("Tom & Jerry's"), 'Tom &amp; Jerry&#39;s');
  assert.equal(js.escapeHtml('Actor1.png'), 'Actor1.png');
});

test('canonicalExt maps encrypted extensions to real ones', () => {
  assert.equal(js.canonicalExt('img/faces/Actor1.png_'), 'img/faces/Actor1.png');
  assert.equal(js.canonicalExt('Actor1.rpgmvp'), 'Actor1.png');
  assert.equal(js.canonicalExt('Theme.RPGMVO'), 'Theme.ogg');
  assert.equal(js.canonicalExt('Battle.m4a_'), 'Battle.m4a');
  assert.equal(js.canonicalExt('plain.jpg'), 'plain.jpg');
});

test('getMimeType follows EXT_REMAP', () => {
  assert.equal(js.getMimeType('a.png_'), 'image/png');
  assert.equal(js.getMimeType('a.rpgmvm'), 'audio/mp4');
  assert.equal(js.getMimeType('a.ogg_'), 'audio/ogg');
  assert.equal(js.getMimeType('a.JPEG'), 'image/jpeg');
  assert.equal(js.getMimeType('a.txt'), 'application/octet-stream');
});

test('MEDIA_EXT accepts media and rejects data files', () => {
  for (const n of ['a.png_', 'a.rpgmvp', 'a.ogg', 'a.m4a_', 'a.webp']) assert.ok(js.MEDIA_EXT.test(n), n);
  for (const n of ['System.json', 'Game.rgss3a', 'a.png.bak']) assert.ok(!js.MEDIA_EXT.test(n), n);
});

// ── MV / MZ ───────────────────────────────────────────────────────────────────
// '00112233…ff', built at runtime so secret scanners do not mistake it for a real key.
const KEY = Array.from({ length: 16 }, (_, i) => (i * 17).toString(16).padStart(2, '0')).join('');
function encryptMVMZ(plain, hexKey) {
  const body = new Uint8Array(plain);
  const key = hexKey.match(/.{2}/g).map(h => parseInt(h, 16));
  for (let i = 0; i < 16 && i < body.length; i++) body[i] ^= key[i];
  const out = new Uint8Array(16 + body.length);
  out.set(js.RPG_HEADER, 0);
  out.set(body, 16);
  return out.buffer;
}

test('decryptMVMZ restores the original bytes', () => {
  const plain = Array.from({ length: 40 }, (_, i) => (i * 37) & 0xff);
  assert.deepEqual(bytes(js.decryptMVMZ(encryptMVMZ(plain, KEY), KEY)), plain);
});

test('decryptMVMZ rejects a file without the RPG Maker header', () => {
  const buf = encryptMVMZ(new Array(32).fill(0), KEY);
  new Uint8Array(buf)[0] = 0;
  assert.throws(() => js.decryptMVMZ(buf, KEY), /Invalid header/);
});

test('decryptMVMZ rejects a short key', () => {
  assert.throws(() => js.decryptMVMZ(encryptMVMZ(new Array(32).fill(0), KEY), 'abcd'), /Key too short/);
});

// ── RGSSAD ────────────────────────────────────────────────────────────────────
// Encoders mirroring the formats documented in js/decrypt-rgssad.js and CLAUDE.md.
// Data encryption is an XOR stream, so rgssDecryptData also encrypts.
const step = k => ((k * 7) + 3) >>> 0;
const xorData = (data, key) => new Uint8Array(js.rgssDecryptData(Uint8Array.from(data), key));
const FILES = [
  { name: 'Graphics\\Pictures\\title.png', data: Array.from({ length: 23 }, (_, i) => (i * 11) & 0xff) },
  { name: 'Audio\\BGM\\theme.ogg', data: [1, 2, 3, 4, 5, 6, 7, 8, 9] },
];

function buildV1(files) {
  const out = [...enc.encode('RGSSAD\0'), 1];
  let key = 0xDEADCAFE;
  const int = v => {
    const b = new Uint8Array(new Uint32Array([(v ^ key) >>> 0]).buffer);
    out.push(...b);
    key = step(key);
  };
  for (const f of files) {
    const name = enc.encode(f.name);
    int(name.length);
    for (const c of name) { out.push(c ^ (key & 0xff)); key = step(key); }
    int(f.data.length);
    out.push(...xorData(f.data, key));
  }
  return Uint8Array.from(out).buffer;
}

function buildV3(files, seed) {
  const mKey = (((seed * 9) >>> 0) + 3) >>> 0;
  const mkb = new Uint8Array(new Uint32Array([mKey]).buffer);
  const u32 = v => [...new Uint8Array(new Uint32Array([v >>> 0]).buffer)];
  const names = files.map(f => enc.encode(f.name));
  const dirSize = names.reduce((n, b) => n + 16 + b.length, 0) + 16;
  let offset = 12 + dirSize;
  const dir = [], data = [];
  files.forEach((f, i) => {
    const fKey = (0x1234567 * (i + 1)) >>> 0;
    dir.push(...u32(offset ^ mKey), ...u32(f.data.length ^ mKey), ...u32(fKey ^ mKey), ...u32(names[i].length ^ mKey));
    dir.push(...names[i].map((c, j) => c ^ mkb[j % 4]));
    data.push(...xorData(f.data, fKey));
    offset += f.data.length;
  });
  dir.push(...u32(mKey), ...u32(0), ...u32(0), ...u32(0)); // offset 0 ends the directory
  return Uint8Array.from([...enc.encode('RGSSAD\0'), 3, ...u32(seed), ...dir, ...data]).buffer;
}

function extract(buf) {
  return [...js.parseRGSSAD(buf)].map(e => ({ // spread: a main-realm array for deepEqual
    name: e.name,
    data: bytes(js.rgssDecryptData(new Uint8Array(buf, e.offset, e.size), e.fKey)),
  }));
}
const expected = FILES.map(f => ({ name: f.name.replace(/\\/g, '/'), data: f.data }));

test('parseRGSSAD reads a v1 archive (XP / VX)', () => {
  assert.deepEqual(extract(buildV1(FILES)), expected);
});

test('parseRGSSAD reads a v3 archive (VX Ace)', () => {
  assert.deepEqual(extract(buildV3(FILES, 0x2A5F1C3B)), expected);
});

test('parseRGSSAD rejects other files and versions', () => {
  assert.throws(() => js.parseRGSSAD(enc.encode('PK\x03\x04 not an archive').buffer), /Not a valid RGSSAD/);
  assert.throws(() => js.parseRGSSAD(Uint8Array.from([...enc.encode('RGSSAD\0'), 2, 0, 0, 0, 0]).buffer),
    /v2 is not supported/);
});

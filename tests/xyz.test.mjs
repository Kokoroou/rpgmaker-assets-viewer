// RPG Maker 2000/2003 XYZ images (js/xyz.js) on synthetic bytes built here.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import { deflateSync, inflateSync } from 'node:zlib';

function load(globals = {}) {
  const ctx = vm.createContext({ TextDecoder, TextEncoder, Blob, Response, CompressionStream, DecompressionStream, ...globals });
  for (const f of ['constants.js', 'xyz.js', 'filters.js'])
    vm.runInContext(readFileSync(new URL(`../js/${f}`, import.meta.url), 'utf8'), ctx, { filename: f });
  return vm.runInContext('({ xyzSize, xyzToPng, XYZ_EXT, MEDIA_EXT, IMAGE_EXT, canonicalExt, getMimeType, imageSize })', ctx);
}
const js = load({ $: () => null, document: null });

// A w×h XYZ: palette entry i = (i, 255 - i, i * 2), pixel (x, y) = (x + y * w) % 256.
function xyz(w, h, cut = 0) {
  const pal = new Uint8Array(768).map((_, k) => [k / 3 | 0, 255 - (k / 3 | 0), (k / 3 | 0) * 2 & 255][k % 3]);
  const idx = new Uint8Array(w * h).map((_, i) => i % 256);
  const z = deflateSync(Buffer.concat([pal, idx]).subarray(0, 768 + w * h - cut));
  return new Uint8Array([0x58, 0x59, 0x5a, 0x31, w & 255, w >> 8, h & 255, h >> 8, ...z]);
}

// Minimal PNG reader for the checks: chunks by type.
function chunks(png) {
  const out = {}, dv = new DataView(png.buffer, png.byteOffset);
  for (let at = 8; at < png.length;) {
    const len = dv.getUint32(at), type = String.fromCharCode(...png.subarray(at + 4, at + 8));
    out[type] = Buffer.concat([out[type] || Buffer.alloc(0), png.subarray(at + 8, at + 8 + len)]);
    at += 12 + len;
  }
  return out;
}

test('xyzSize reads the header, rejects other data', () => {
  assert.deepEqual({ ...js.xyzSize(xyz(20, 30)) }, { w: 20, h: 30 });
  assert.equal(js.xyzSize(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0])), null);
  assert.equal(js.xyzSize(new Uint8Array([0x58, 0x59, 0x5a, 0x31, 0, 0, 5, 0])), null, 'zero width');
  assert.deepEqual({ ...js.imageSize(xyz(320, 240)) }, { w: 320, h: 240 }, 'the size filter reads it too');
});

test('xyzToPng: an indexed PNG with the same palette and pixels', async () => {
  const w = 300, h = 7;   // rows longer than the palette, so row offsets matter
  const png = await js.xyzToPng(xyz(w, h).buffer);
  assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const c = chunks(png);
  assert.deepEqual([c.IHDR.readUInt32BE(0), c.IHDR.readUInt32BE(4), ...c.IHDR.subarray(8)], [w, h, 8, 3, 0, 0, 0]);
  assert.equal(c.PLTE.length, 768);
  assert.deepEqual([...c.PLTE.subarray(3 * 200, 3 * 200 + 3)], [200, 55, 144]);
  const rows = inflateSync(c.IDAT);
  assert.equal(rows.length, (w + 1) * h);
  for (let y = 0; y < h; y++) {
    assert.equal(rows[y * (w + 1)], 0, 'filter None');
    for (const x of [0, 1, w - 1]) assert.equal(rows[y * (w + 1) + 1 + x], (x + y * w) % 256);
  }
  assert.ok('IEND' in c);
});

test('xyzToPng rejects broken files', async () => {
  await assert.rejects(js.xyzToPng(new TextEncoder().encode('not an image')), /Not an XYZ/);
  await assert.rejects(js.xyzToPng(xyz(10, 10, 5)), /cut short/);
  const bad = xyz(4, 4); bad[12] ^= 0xff;
  await assert.rejects(js.xyzToPng(bad));
});

test('.xyz is listed as an image and saved as .png', () => {
  assert.ok(js.MEDIA_EXT.test('Picture/title.xyz') && js.IMAGE_EXT.test('a.XYZ'));
  assert.equal(js.canonicalExt('CharSet/hero.xyz'), 'CharSet/hero.png');
  assert.equal(js.getMimeType('hero.xyz'), 'image/png');
});

test('legacy copy: no .xyz', () => {
  const old = load({ SITE: { isLegacy: true }, $: () => null, document: null });
  assert.ok(!old.MEDIA_EXT.test('a.xyz'));
  assert.equal(old.canonicalExt('a.xyz'), 'a.xyz');
  assert.equal(old.imageSize(xyz(8, 8)), null);
});

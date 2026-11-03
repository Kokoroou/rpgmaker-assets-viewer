// Filter by type / image size / audio length (roadmap item 10). Synthetic bytes only.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const ctx = vm.createContext({ $: () => null, document: null });
for (const f of ['constants.js', 'decrypt-mvmz.js', 'filters.js'])
  vm.runInContext(readFileSync(new URL(`../js/${f}`, import.meta.url), 'utf8'), ctx, { filename: f });
const js = vm.runInContext(`({ imageSize, oggDuration, mp4Duration, parseDuration, fmtDuration,
  filterMatch, filterSummary, NO_FILTER, entryReader, readMeta,
  setKey: k => { S.key = k; } })`, Object.assign(ctx, {
  S: { key: '' },
  entryFile: e => Promise.resolve(e._file),
  decryptWithKey: b => ctx.decryptMVMZ(b, ctx.S.key),
}));

const bytes = (...parts) => {
  const out = [];
  for (const p of parts) typeof p === 'string' ? out.push(...[...p].map(c => c.charCodeAt(0))) : out.push(...p);
  return new Uint8Array(out);
};
const be32 = n => [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const le32 = n => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, n >>> 24];
const le16 = n => [n & 255, n >>> 8];
const be16 = n => [n >>> 8, n & 255];

const png = (w, h) => bytes([0x89], 'PNG\r\n\x1a\n', be32(13), 'IHDR', be32(w), be32(h), [8, 6, 0, 0, 0], [0, 0, 0, 0]);

test('imageSize reads PNG, GIF, BMP, JPEG and WebP headers', () => {
  assert.deepEqual({ ...js.imageSize(png(816, 624)) }, { w: 816, h: 624 });
  assert.deepEqual({ ...js.imageSize(bytes('GIF89a', le16(32), le16(48), [0, 0, 0])) }, { w: 32, h: 48 });
  const bmp = (h) => bytes('BM', le32(0), le32(0), le32(54), le32(40), le32(144), le32(h), le16(1), le16(32));
  assert.deepEqual({ ...js.imageSize(bmp(144)) }, { w: 144, h: 144 });
  assert.deepEqual({ ...js.imageSize(bmp(-96 >>> 0)) }, { w: 144, h: 96 }, 'top-down BMP has a negative height');
  // JPEG: SOI, an APP0 segment to skip, then SOF0 (precision, height, width).
  const jpg = bytes([0xff, 0xd8, 0xff, 0xe0], be16(16), 'JFIF\0', new Array(9).fill(0),
    [0xff, 0xc0], be16(17), [8], be16(300), be16(400), [3], new Array(9).fill(0));
  assert.deepEqual({ ...js.imageSize(jpg) }, { w: 400, h: 300 });
  const webpL = bytes('RIFF', le32(0), 'WEBP', 'VP8L', le32(5), [0x2f],
    // width-1 = 99 (14 bits), height-1 = 49 (14 bits), packed little-endian
    [99 & 255, ((99 >> 8) & 0x3f) | ((49 & 3) << 6), (49 >> 2) & 255, (49 >> 10) & 0x0f], [0, 0, 0, 0, 0]);
  assert.deepEqual({ ...js.imageSize(webpL) }, { w: 100, h: 50 });
  const webpX = bytes('RIFF', le32(0), 'WEBP', 'VP8X', le32(10), [0, 0, 0, 0], [255, 3, 0], [199, 0, 0]);
  assert.deepEqual({ ...js.imageSize(webpX) }, { w: 1024, h: 200 });
  const webp = bytes('RIFF', le32(0), 'WEBP', 'VP8 ', le32(10), [0, 0, 0], [0x9d, 0x01, 0x2a], le16(640), le16(480));
  assert.deepEqual({ ...js.imageSize(webp) }, { w: 640, h: 480 });
});

test('imageSize rejects unknown or truncated data', () => {
  assert.equal(js.imageSize(new Uint8Array(0)), null);
  assert.equal(js.imageSize(png(0, 10)), null);
  assert.equal(js.imageSize(png(10, 10).subarray(0, 20)), null);
  assert.equal(js.imageSize(bytes('not an image at all')), null);
  assert.equal(js.imageSize(bytes([0xff, 0xd8, 0xff, 0xda], be16(4), new Array(20).fill(0))), null, 'scan before SOF');
});

// Ogg page with one packet (RFC 3533 header, lacing values for len < 255 * n).
function oggPage(serial, granule, packet, flags = 0) {
  const segs = [];
  let n = packet.length;
  while (n >= 255) { segs.push(255); n -= 255; }
  segs.push(n);
  const lo = granule === -1 ? 0xffffffff : granule % 4294967296;
  const hi = granule === -1 ? 0xffffffff : Math.floor(granule / 4294967296);
  return bytes('OggS', [0, flags], le32(lo), le32(hi), le32(serial), le32(0), le32(0), [segs.length], segs, packet);
}
const vorbisId = rate => bytes([1], 'vorbis', le32(0), [2], le32(rate), le32(0), le32(0), le32(0), [0xb8, 1]);
const opusHead = skip => bytes('OpusHead', [1, 2], le16(skip), le32(48000), le16(0), [0]);

test('oggDuration: last granule / sample rate (Vorbis)', () => {
  const head = oggPage(7, 0, vorbisId(44100), 2);
  const tail = bytes(new Array(50).fill(0), oggPage(7, 44100 * 90, new Uint8Array(40)), oggPage(7, 44100 * 93.5, new Uint8Array(30), 4));
  assert.equal(js.oggDuration(head, tail), 93.5);
  const single = bytes(head, oggPage(7, 22050, new Uint8Array(10), 4));
  assert.equal(js.oggDuration(single, single), 0.5, 'small file: head and tail are the same buffer');
});

test('oggDuration ignores pages of other streams, unset granules and fake "OggS"', () => {
  const head = oggPage(7, 0, vorbisId(48000), 2);
  const tail = bytes(oggPage(7, 48000 * 10, new Uint8Array(5)), oggPage(7, -1, new Uint8Array(5)),
    oggPage(9, 48000 * 999, new Uint8Array(5)), 'OggS', [0], new Array(40).fill(0));
  assert.equal(js.oggDuration(head, tail), 10);
  assert.equal(js.oggDuration(bytes('Oggx', new Array(60).fill(0)), tail), null);
  assert.equal(js.oggDuration(head, bytes(new Array(100).fill(0))), null);
});

test('oggDuration handles Opus pre-skip at 48 kHz', () => {
  const head = oggPage(3, 0, opusHead(312), 2);
  const tail = oggPage(3, 48000 * 4 + 312, new Uint8Array(8), 4);
  assert.equal(js.oggDuration(head, tail), 4);
});

// MP4: ftyp, a free box, then moov > [trak placeholder, mvhd].
function mp4({ version = 0, scale = 1000, dur = 61500, large = false } = {}) {
  const box = (type, body) => bytes(be32(8 + body.length), type, body);
  const mvhd = version === 1
    ? box('mvhd', bytes([1, 0, 0, 0], new Array(16).fill(0), be32(scale), be32(Math.floor(dur / 4294967296)), be32(dur % 4294967296), new Array(80).fill(0)))
    : box('mvhd', bytes([0, 0, 0, 0], be32(0), be32(0), be32(scale), be32(dur), new Array(80).fill(0)));
  const moovBody = bytes(box('trak', new Uint8Array(20)), mvhd);
  const moov = large ? bytes(be32(1), 'moov', be32(0), be32(16 + moovBody.length), moovBody) : box('moov', moovBody);
  return bytes(box('ftyp', bytes('M4A ', be32(0), 'M4A mp42isom')), box('free', new Uint8Array(100)), moov);
}
const readerOf = u => async (o, n) => u.subarray(o, o + n);

test('mp4Duration reads mvhd (v0, v1, 64-bit box size)', async () => {
  for (const opts of [{}, { version: 1, scale: 44100, dur: 44100 * 125 }, { large: true }]) {
    const u = mp4(opts);
    const want = (opts.dur ?? 61500) / (opts.scale ?? 1000);
    assert.equal(await js.mp4Duration(readerOf(u), u.length), want);
  }
});

test('mp4Duration stops on broken boxes', async () => {
  const u = mp4();
  const broken = u.slice(); broken.set(be32(3), 0);         // box smaller than its header
  assert.equal(await js.mp4Duration(readerOf(broken), broken.length), null);
  const huge = u.slice(); huge.set(be32(0x7fffffff), 0);    // box past the end of the file
  assert.equal(await js.mp4Duration(readerOf(huge), huge.length), null);
  assert.equal(await js.mp4Duration(readerOf(u.subarray(0, 40)), 40), null, 'no moov');
});

test('readMeta decrypts MV/MZ files and reads only their headers', async () => {
  // '00112233…ff', built at runtime so secret scanners do not mistake it for a real key.
  const key = Array.from({ length: 16 }, (_, i) => (i * 17).toString(16).padStart(2, '0')).join('');
  const k = key.match(/.{2}/g).map(h => parseInt(h, 16));
  const enc = plain => {
    const body = plain.slice();
    for (let i = 0; i < 16; i++) body[i] ^= k[i];
    return bytes([0x52, 0x50, 0x47, 0x4d, 0x56, 0, 0, 0, 0, 3, 1, 0, 0, 0, 0, 0], body);
  };
  js.setKey(key);
  const file = u => ({ size: u.length, slice: (a, b) => ({ arrayBuffer: async () => u.slice(a, b).buffer }) });

  const img = { name: 'a.rpgmvp', isImage: true, _file: file(enc(png(48, 96))) };
  assert.deepEqual({ ...await js.readMeta(img) }, { w: 48, h: 96 });

  const ogg = bytes(oggPage(1, 0, vorbisId(44100), 2), new Uint8Array(70000), oggPage(1, 44100 * 200, new Uint8Array(9), 4));
  const aud = { name: 'b.ogg_', isAudio: true, _file: file(enc(ogg)) };
  assert.deepEqual({ ...await js.readMeta(aud) }, { dur: 200 });

  const m4a = { name: 'c.m4a', isAudio: true, _file: file(mp4()) };
  assert.deepEqual({ ...await js.readMeta(m4a) }, { dur: 61.5 });

  const arch = { name: 'd.png', isImage: true, _getData: async () => png(640, 480).buffer };
  assert.deepEqual({ ...await js.readMeta(arch) }, { w: 640, h: 480 });

  assert.equal(await js.readMeta({ name: 'e.png', isImage: true, _file: file(bytes('garbage', new Array(30).fill(0))) }), null);
});

test('parseDuration accepts seconds and m:ss, rejects the rest', () => {
  assert.equal(js.parseDuration(''), null);
  assert.equal(js.parseDuration('  '), null);
  assert.equal(js.parseDuration('90'), 90);
  assert.equal(js.parseDuration('90s'), 90);
  assert.equal(js.parseDuration('1.5'), 1.5);
  assert.equal(js.parseDuration('1:30'), 90);
  assert.equal(js.parseDuration('1:02:03'), 3723);
  assert.ok(Number.isNaN(js.parseDuration('1:75')));
  assert.ok(Number.isNaN(js.parseDuration('abc')));
  assert.ok(Number.isNaN(js.parseDuration('-5')));
  assert.equal(js.fmtDuration(65), '1:05');
  assert.equal(js.fmtDuration(3723), '1:02:03');
});

test('filterMatch: type, image bounds, audio bounds', () => {
  const img = { isImage: true }, aud = { isAudio: true };
  const f = o => ({ ...js.NO_FILTER, ...o });
  assert.equal(js.filterMatch(img, null, f({})), true);
  assert.equal(js.filterMatch(aud, null, f({ type: 'image' })), false);
  assert.equal(js.filterMatch(img, null, f({ type: 'audio' })), false);

  const big = f({ minW: 100 });
  assert.equal(js.filterMatch(img, null, big), null, 'unknown size: undecided');
  assert.equal(js.filterMatch(img, { w: 100, h: 1 }, big), true, 'bounds are inclusive');
  assert.equal(js.filterMatch(img, { w: 99, h: 1 }, big), false);
  assert.equal(js.filterMatch(aud, null, big), false, 'a size bound alone hides audio');

  const tile = f({ minW: 48, maxW: 48, minH: 48, maxH: 48 });
  assert.equal(js.filterMatch(img, { w: 48, h: 48 }, tile), true);
  assert.equal(js.filterMatch(img, { w: 48, h: 96 }, tile), false);

  const long = f({ minLen: 60 });
  assert.equal(js.filterMatch(aud, { dur: 61 }, long), true);
  assert.equal(js.filterMatch(aud, { dur: 59 }, long), false);
  assert.equal(js.filterMatch(img, { w: 1, h: 1 }, long), false, 'a length bound alone hides images');

  const both = f({ maxW: 64, maxLen: 5 });
  assert.equal(js.filterMatch(img, { w: 32, h: 32 }, both), true);
  assert.equal(js.filterMatch(aud, { dur: 3 }, both), true);
  assert.equal(js.filterMatch(aud, { dur: 3 }, f({ maxW: 64, maxLen: 5, type: 'image' })), false);
});

test('filterSummary is short and readable', () => {
  const f = o => ({ ...js.NO_FILTER, ...o });
  assert.equal(js.filterSummary(f({ type: 'audio' })), 'audio');
  assert.equal(js.filterSummary(f({ minW: 48, maxW: 48, minH: 48, maxH: 48 })), '48 × 48 px');
  assert.equal(js.filterSummary(f({ minW: 100 })), '≥ 100 × any px');
  assert.equal(js.filterSummary(f({ type: 'audio', minLen: 30, maxLen: 90 })), 'audio, 0:30–1:30');
});

test('Filter.start() spawns a fixed number of workers even when they exit at once', () => {
  ctx.S.files = new Map([['bgm/a.ogg', { isAudio: true }]]);
  ctx.S.currentFolder = 'bgm';
  ctx.folderPaths = () => ['bgm/a.ogg'];
  const Filter = vm.runInContext('Filter', ctx);
  Filter.f = { ...js.NO_FILTER, minLen: 30 };
  let calls = 0;
  Filter._work = function () {
    if (++calls > 50) throw new Error('respawn loop');
    this.workers--;
  };
  Filter.start();
  assert.equal(calls, 4);
});

// Ogg Vorbis loop-point parsing on synthetic bytes (no real audio).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const ctx = vm.createContext({ TextDecoder, TextEncoder });
vm.runInContext(readFileSync(new URL('../js/audio-loop.js', import.meta.url), 'utf8'), ctx);
const { parseOggLoop, fmtLoopTime } = vm.runInContext('({ parseOggLoop, fmtLoopTime })', ctx);

const le32 = n => [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255];
const ascii = s => [...s].map(c => c.charCodeAt(0));

// One Ogg page holding the given packets (each < 255 bytes, or split by the caller).
function page(packets, seq = 0) {
  const segs = packets.map(p => p.length);
  const hdr = [...ascii('OggS'), 0, 0, ...Array(8).fill(0), ...le32(1), ...le32(seq), ...le32(0), segs.length, ...segs];
  return [...hdr, ...packets.flat()];
}
function idPacket(rate) {
  return [1, ...ascii('vorbis'), ...le32(0), 2, ...le32(rate), ...le32(0), ...le32(0), ...le32(0), 0xb8, 1];
}
function commentPacket(comments) {
  const vendor = ascii('test');
  const body = comments.flatMap(c => [...le32(c.length), ...ascii(c)]);
  return [3, ...ascii('vorbis'), ...le32(vendor.length), ...vendor, ...le32(comments.length), ...body, 1];
}
const buf = bytes => new Uint8Array(bytes).buffer;

test('reads LOOPSTART / LOOPLENGTH and the sample rate', () => {
  const b = buf([...page([idPacket(44100)]), ...page([commentPacket(['TITLE=x', 'LOOPSTART=44100', 'LOOPLENGTH=88200'])], 1)]);
  const r = parseOggLoop(b);
  assert.deepEqual({ ...r }, { rate: 44100, start: 44100, length: 88200, end: 132300 });
});

test('tag names are case-insensitive; LOOPLENGTH is optional', () => {
  const r = parseOggLoop(buf([...page([idPacket(48000), commentPacket(['loopstart=96000'])])]));
  assert.equal(r.start, 96000);
  assert.equal(r.end, null);
});

test('returns null without loop tags, with junk values or bad input', () => {
  assert.equal(parseOggLoop(buf(page([idPacket(44100), commentPacket(['TITLE=x'])]))), null);
  assert.equal(parseOggLoop(buf(page([idPacket(44100), commentPacket(['LOOPSTART=abc'])]))), null);
  assert.equal(parseOggLoop(new ArrayBuffer(4)), null);
  assert.equal(parseOggLoop(buf(ascii('RIFF'.repeat(20)))), null);
  assert.equal(parseOggLoop(buf(page([idPacket(0), commentPacket(['LOOPSTART=1'])]))), null);
});

test('truncated file and absurd comment lengths do not throw', () => {
  const good = page([idPacket(44100), commentPacket(['LOOPSTART=5'])]);
  for (let n = 0; n < good.length; n += 7) assert.doesNotThrow(() => parseOggLoop(buf(good.slice(0, n))));
  const evil = commentPacket(['LOOPSTART=5']);
  evil.splice(7, 4, 255, 255, 255, 255); // vendor length 0xFFFFFFFF
  assert.equal(parseOggLoop(buf(page([idPacket(44100), evil]))), null);
});

test('fmtLoopTime', () => {
  assert.equal(fmtLoopTime(75.5), '1:15.50');
  assert.equal(fmtLoopTime(3.2), '0:03.20');
});

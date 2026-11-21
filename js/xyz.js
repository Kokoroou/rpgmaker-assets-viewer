// ─── RPG Maker 2000 / 2003 XYZ images ─────────────────
// Format (libxyzimage by Ghabry, EasyRPG Tools XYZ2PNG, vn-tools xyz2png):
//   "XYZ1", width u16 LE, height u16 LE, then one zlib stream holding
//   a 256-colour palette (256 × R,G,B) followed by width × height palette indices.
// The viewer turns it into an indexed PNG (same palette, same indices: lossless),
// with the browser's DecompressionStream / CompressionStream (zlib, "deflate").
// No DOM, tested in node (tests/xyz.test.mjs).

const XYZ_EXT = /\.xyz$/i;
const XYZ_MAX_PIXELS = 4096 * 4096;   // the editor's images are far smaller: refuse absurd headers

// {w, h} from the first 8 bytes, or null.
function xyzSize(u) {
  if (!u || u.length < 8 || u[0] !== 0x58 || u[1] !== 0x59 || u[2] !== 0x5a || u[3] !== 0x31) return null;
  const w = u[4] | (u[5] << 8), h = u[6] | (u[7] << 8);
  return w && h ? { w, h } : null;
}

async function _zlib(bytes, inflate) {
  const stream = new Blob([bytes]).stream().pipeThrough(inflate ? new DecompressionStream('deflate') : new CompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

const _PNG_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function _pngChunk(type, data) {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  let c = 0xffffffff;
  for (let i = 4; i < 8 + data.length; i++) c = _PNG_CRC[(c ^ out[i]) & 255] ^ (c >>> 8);
  dv.setUint32(8 + data.length, (c ^ 0xffffffff) >>> 0);
  return out;
}

// PNG bytes (8-bit indexed) of an XYZ file; throws on a broken file.
async function xyzToPng(buffer) {
  const u = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const size = xyzSize(u);
  if (!size) throw new Error('Not an XYZ image');
  const { w, h } = size;
  if (w * h > XYZ_MAX_PIXELS) throw new Error('XYZ image too large');
  const data = await _zlib(u.subarray(8), true);
  if (data.length < 768 + w * h) throw new Error('XYZ image data is cut short');

  const rows = new Uint8Array((w + 1) * h);   // filter byte 0 ("None") + indices, per row
  for (let y = 0; y < h; y++) rows.set(data.subarray(768 + y * w, 768 + (y + 1) * w), y * (w + 1) + 1);
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, w); dv.setUint32(4, h);
  ihdr.set([8, 3, 0, 0, 0], 8);               // 8-bit, palette, deflate, adaptive filters, no interlace
  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    _pngChunk('IHDR', ihdr),
    _pngChunk('PLTE', data.subarray(0, 768)),
    _pngChunk('IDAT', await _zlib(rows, false)),
    _pngChunk('IEND', new Uint8Array(0)),
  ];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

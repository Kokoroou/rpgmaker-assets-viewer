// Decrypts raw file data from an RGSSAD archive.
// Key cycles every 4 bytes: k = (k * 7 + 3) >>> 0
function rgssDecryptData(rawBytes, startKey) {
  const out = new Uint8Array(rawBytes.length);
  let k  = startKey >>> 0;
  let kb = new Uint8Array(new Uint32Array([k]).buffer);
  let j  = 0;
  for (let i = 0; i < rawBytes.length; i++) {
    if (j === 4) {
      j  = 0;
      k  = ((k * 7) + 3) >>> 0;
      kb = new Uint8Array(new Uint32Array([k]).buffer);
    }
    out[i] = rawBytes[i] ^ kb[j++];
  }
  return out.buffer;
}

// RPG Maker XP and VX (.rgssad, .rgss2a) — version byte = 1
function parseRGSSADv1(buf) {
  const raw  = new Uint8Array(buf);
  const view = new DataView(buf);
  const dec  = new TextDecoder();
  let key = 0xDEADCAFE >>> 0;
  let pos = 8;
  const entries = [];

  function nextInt() {
    const v = (view.getInt32(pos, true) ^ key) >>> 0;
    key = ((key * 7) + 3) >>> 0;
    pos += 4;
    return v;
  }

  function nextName(len) {
    const b = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      b[i] = raw[pos++] ^ (key & 0xff);
      key  = ((key * 7) + 3) >>> 0;
    }
    return dec.decode(b);
  }

  while (pos + 8 <= buf.byteLength) {
    const nameLen = nextInt();
    if (nameLen <= 0 || pos + nameLen + 4 > buf.byteLength) break;
    const name   = nextName(nameLen);
    const size   = nextInt();
    const offset = pos;
    const fKey   = key;
    entries.push({ name: name.replace(/\\/g, '/'), size, offset, fKey });
    pos += size;
  }

  return entries.map(e => ({ name: e.name, offset: e.offset, size: e.size, fKey: e.fKey }));
}

// RPG Maker VX Ace (.rgss3a) — version byte = 3
function parseRGSSADv3(buf) {
  const raw  = new Uint8Array(buf);
  const view = new DataView(buf);
  const dec  = new TextDecoder();
  const mKey = (((view.getUint32(8, true) * 9) >>> 0) + 3) >>> 0;
  const mkb  = new Uint8Array(new Uint32Array([mKey]).buffer);
  let pos    = 12;
  const entries = [];

  function xInt() {
    const v = view.getInt32(pos, true) ^ mKey;
    pos += 4;
    return v;
  }

  while (pos + 16 <= buf.byteLength) {
    const offset  = xInt();
    const size    = xInt();
    const fKey    = xInt() >>> 0;
    const nameLen = xInt();
    if (offset === 0) break;
    const nb = new Uint8Array(nameLen);
    for (let i = 0; i < nameLen; i++) nb[i] = raw[pos + i] ^ mkb[i % 4];
    pos += nameLen;
    entries.push({
      name:   dec.decode(nb).replace(/\\/g, '/'),
      size,
      offset: offset >>> 0,
      fKey,
    });
  }

  return entries.map(e => ({ name: e.name, offset: e.offset >>> 0, size: e.size, fKey: e.fKey }));
}

function parseRGSSAD(buf) {
  const raw = new Uint8Array(buf);
  if (String.fromCharCode(...raw.slice(0, 6)) !== 'RGSSAD')
    throw new Error('Not a valid RGSSAD file');
  const ver = raw[7];
  if (ver === 1) return parseRGSSADv1(buf);
  if (ver === 3) return parseRGSSADv3(buf);
  throw new Error(`RGSSAD v${ver} is not supported (only v1 and v3 are supported)`);
}

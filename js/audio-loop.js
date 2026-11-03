// Loop points of an Ogg Vorbis file (roadmap item 7).
// RPG Maker MV/MZ (and many tools, e.g. crosslooper) store them as Vorbis comments
// LOOPSTART and LOOPLENGTH, in samples. Formats: Ogg page layout (RFC 3533) and the
// Vorbis I identification/comment headers (Xiph.org Vorbis spec, sections 4.2.2-4.2.3).
// Only the first two packets are read; nothing is decoded and nothing is executed.
// Returns { rate, start, length, end } (samples) or null if absent/invalid.

function parseOggLoop(buffer) {
  try {
    const u = new Uint8Array(buffer);
    if (u.length < 27) return null;
    const packets = [];          // completed packets (we need the first two)
    let cur = [], pos = 0;
    while (packets.length < 2 && pos + 27 <= u.length) {
      if (u[pos] !== 0x4f || u[pos + 1] !== 0x67 || u[pos + 2] !== 0x67 || u[pos + 3] !== 0x53) return null; // "OggS"
      const nseg = u[pos + 26];
      let off = pos + 27 + nseg;
      if (off > u.length) return null;
      for (let i = 0; i < nseg; i++) {
        const len = u[pos + 27 + i];
        if (off + len > u.length) return null;
        cur.push(u.subarray(off, off + len));
        off += len;
        if (len < 255) { packets.push(concatBytes(cur)); cur = []; if (packets.length === 2) break; }
      }
      pos = off;
    }
    if (packets.length < 2) return null;
    const id = packets[0], cm = packets[1];
    const tag = (p, t, n) => p.length >= n && p[0] === t && 'vorbis' === String.fromCharCode(...p.subarray(1, 7));
    if (!tag(id, 1, 30) || !tag(cm, 3, 8)) return null;
    const rate = new DataView(id.buffer, id.byteOffset, id.byteLength).getUint32(12, true);
    if (!rate) return null;

    const dv = new DataView(cm.buffer, cm.byteOffset, cm.byteLength);
    const dec = new TextDecoder('utf-8');
    let p = 7;
    const vlen = dv.getUint32(p, true); p += 4 + vlen;
    if (p + 4 > cm.length) return null;
    const count = dv.getUint32(p, true); p += 4;
    let start = null, length = null;
    for (let i = 0; i < count && p + 4 <= cm.length; i++) {
      const l = dv.getUint32(p, true); p += 4;
      if (l > cm.length - p) break;
      const s = dec.decode(cm.subarray(p, p + l)); p += l;
      const eq = s.indexOf('=');
      if (eq < 0) continue;
      const k = s.slice(0, eq).toUpperCase(), v = s.slice(eq + 1).trim();
      if (!/^\d{1,12}$/.test(v)) continue;
      if (k === 'LOOPSTART') start = Number(v);
      else if (k === 'LOOPLENGTH') length = Number(v);
    }
    if (start === null) return null;
    // Without LOOPLENGTH the loop runs to the end of the track.
    return { rate, start, length, end: length === null ? null : start + length };
  } catch (_) {
    return null;
  }
}

function concatBytes(parts) {
  if (parts.length === 1) return parts[0];
  const out = new Uint8Array(parts.reduce((n, a) => n + a.length, 0));
  let o = 0;
  for (const a of parts) { out.set(a, o); o += a.length; }
  return out;
}

function fmtLoopTime(sec) {
  const m = Math.floor(sec / 60);
  return `${m}:${(sec - m * 60).toFixed(2).padStart(5, '0')}`;
}

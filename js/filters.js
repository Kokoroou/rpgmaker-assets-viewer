// ─── Filter by type, image size, audio length (roadmap item 10) ───
// The toolbar filter panel narrows the folder on screen to images or audio,
// images within a width/height range and audio within a length range. Sizes
// and lengths come from each file's header only (a few KB from the start, and
// for Ogg a few KB from the end): nothing is decoded and the bytes never leave
// the browser. Reading starts only when a size or length bound is set, covers
// the folder on screen, and waits while a thumbnail or the lightbox reads
// (Fg.active, js/ui.js), as the folder scan and duplicate hashing do. Results
// live in memory only and are dropped with the library.
//
// Format sources (header fields only):
//   PNG  — W3C PNG spec, 11.2.2 IHDR: width/height u32 BE at bytes 16/20
//   GIF  — GIF89a spec, 18. Logical Screen Descriptor: u16 LE at bytes 6/8
//   BMP  — Microsoft BITMAPCOREHEADER / BITMAPINFOHEADER after the 14-byte file header
//   JPEG — ITU-T T.81, B.1.1.3 marker segments and B.2.2 frame header (SOFn)
//   WebP — RFC 9649 (WebP container): VP8 / VP8L / VP8X chunk headers
//   Ogg  — RFC 3533 page header (granule position = samples at page end),
//          Vorbis I spec 4.2.2 (identification header: rate), RFC 7845 (Opus:
//          48 kHz granules, pre-skip in OpusHead)
//   MP4  — ISO/IEC 14496-12, 8.2.2 mvhd (timescale, duration) inside moov

const META_HEAD = 65536;   // bytes read from the start (image header, Ogg first page)
const META_TAIL = 65536;   // bytes read from the end of an Ogg file (last page)
const META_WORKERS = 4;    // header reads are tiny: a few in flight

// ── Pure header parsers (tested in tests/filters.test.mjs) ──

// {w, h} of a PNG/GIF/BMP/JPEG/WebP from its first bytes, or null.
function imageSize(u) {
  if (!u || u.length < 10) return null;
  const be16 = i => (u[i] << 8) | u[i + 1];
  const le16 = i => u[i] | (u[i + 1] << 8);
  const be32 = i => ((u[i] << 24) >>> 0) + (u[i + 1] << 16) + (u[i + 2] << 8) + u[i + 3];
  const le32 = i => (u[i] | (u[i + 1] << 8) | (u[i + 2] << 16)) + ((u[i + 3] << 24) >>> 0);
  const ok = (w, h) => w > 0 && h > 0 ? { w, h } : null;
  const at = (i, s) => [...s].every((c, k) => u[i + k] === c.charCodeAt(0));

  if (u.length >= 24 && u[0] === 0x89 && at(1, 'PNG') && at(12, 'IHDR')) return ok(be32(16), be32(20));
  if (at(0, 'GIF8')) return ok(le16(6), le16(8));
  if (u.length >= 26 && at(0, 'BM')) {
    const dib = le32(14);
    if (dib === 12) return ok(le16(18), le16(20));
    if (dib >= 40) {
      const h = le32(22);
      return ok(le32(18) | 0, Math.abs(h | 0));
    }
    return null;
  }
  if (u[0] === 0xff && u[1] === 0xd8) {
    let p = 2;
    while (p + 9 < u.length) {
      if (u[p] !== 0xff) return null;
      const m = u[p + 1];
      if (m === 0xff) { p++; continue; }                       // fill byte
      if (m === 0x01 || (m >= 0xd0 && m <= 0xd8)) { p += 2; continue; } // no length
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc)
        return ok(be16(p + 7), be16(p + 5));                    // SOFn: P, Y (height), X (width)
      if (m === 0xd9 || m === 0xda) return null;               // end / scan data before any SOF
      p += 2 + be16(p + 2);
    }
    return null;
  }
  if (u.length >= 30 && at(0, 'RIFF') && at(8, 'WEBP')) {
    if (at(12, 'VP8 ') && u[23] === 0x9d && u[24] === 0x01 && u[25] === 0x2a)
      return ok(le16(26) & 0x3fff, le16(28) & 0x3fff);
    if (at(12, 'VP8L') && u[20] === 0x2f) {
      const b = i => u[21 + i];
      return ok(1 + (((b(1) & 0x3f) << 8) | b(0)), 1 + (((b(3) & 0x0f) << 10) | (b(2) << 2) | ((b(1) & 0xc0) >> 6)));
    }
    if (at(12, 'VP8X'))
      return ok(1 + (u[24] | (u[25] << 8) | (u[26] << 16)), 1 + (u[27] | (u[28] << 8) | (u[29] << 16)));
  }
  return null;
}

// Seconds of an Ogg Vorbis/Opus stream from its first bytes (head) and its
// last bytes (tail; the same buffer for a small file), or null.
function oggDuration(head, tail) {
  if (!head || head.length < 28 || !tail) return null;
  const le32 = (u, i) => (u[i] | (u[i + 1] << 8) | (u[i + 2] << 16)) + ((u[i + 3] << 24) >>> 0);
  const isPage = (u, i) => u[i] === 0x4f && u[i + 1] === 0x67 && u[i + 2] === 0x67 && u[i + 3] === 0x53 && u[i + 4] === 0;
  if (!isPage(head, 0)) return null;
  const serial = le32(head, 14);
  const p = 27 + head[26];                       // first packet, right after the segment table
  if (p + 19 > head.length) return null;
  const tag = (s, o = p) => [...s].every((c, k) => head[o + k] === c.charCodeAt(0));
  let rate, skip = 0;
  if (head[p] === 1 && tag('vorbis', p + 1)) {
    if (p + 16 > head.length) return null;
    rate = le32(head, p + 12);
  } else if (tag('OpusHead')) {
    rate = 48000;                                 // Opus granules always count 48 kHz samples
    skip = head[p + 10] | (head[p + 11] << 8);
  } else return null;
  if (!rate) return null;

  // Last page of this stream whose granule is set (-1 = no packet ends on it).
  for (let i = tail.length - 27; i >= 0; i--) {
    if (!isPage(tail, i) || le32(tail, i + 14) !== serial) continue;
    const lo = le32(tail, i + 6), hi = le32(tail, i + 10);
    if (lo === 0xffffffff && hi === 0xffffffff) continue;
    const samples = hi * 4294967296 + lo - skip;
    return samples > 0 ? samples / rate : null;
  }
  return null;
}

// Seconds of an MP4/M4A from the mvhd box. read(offset, length) → Promise<Uint8Array>
// of the (decrypted) file; size = its byte length. Only box headers are read.
async function mp4Duration(read, size) {
  const be32 = (u, i) => ((u[i] << 24) >>> 0) + (u[i + 1] << 16) + (u[i + 2] << 8) + u[i + 3];
  const type = (u, i) => String.fromCharCode(u[i], u[i + 1], u[i + 2], u[i + 3]);
  // Boxes in [start, end): yields {type, body, end} until fn returns non-undefined.
  async function walk(start, end, fn) {
    for (let off = start, n = 0; off + 8 <= end && n < 4096; n++) {
      const h = await read(off, 16);
      if (h.length < 8) return undefined;
      let len = be32(h, 0), hdr = 8;
      if (len === 1) {
        if (h.length < 16) return undefined;
        len = be32(h, 8) * 4294967296 + be32(h, 12); hdr = 16;
      } else if (len === 0) len = end - off;   // box runs to the end of its parent
      if (len < hdr || off + len > end) return undefined;
      const r = await fn(type(h, 4), off + hdr, off + len);
      if (r !== undefined) return r;
      off += len;
    }
    return undefined;
  }
  const d = await walk(0, size, (t, body, end) => t !== 'moov' ? undefined : walk(body, end, async (t2, b2) => {
    if (t2 !== 'mvhd') return undefined;
    const m = await read(b2, 32);
    const v1 = m[0] === 1;
    if (m.length < (v1 ? 32 : 20)) return null;
    const scale = be32(m, v1 ? 20 : 12);
    const dur = v1 ? be32(m, 24) * 4294967296 + be32(m, 28) : be32(m, 16);
    return scale && dur && dur !== 0xffffffff ? dur / scale : null;
  }));
  return d ?? null;
}

// "90", "90s", "1.5", "1:30", "1:02:03" → seconds; '' → null; anything else → NaN.
function parseDuration(s) {
  s = String(s ?? '').trim().toLowerCase().replace(/s$/, '');
  if (!s) return null;
  if (/^\d+(\.\d+)?$/.test(s)) return Number(s);
  const m = /^(?:(\d+):)?(\d+):(\d{1,2}(?:\.\d+)?)$/.exec(s);
  if (m && Number(m[3]) < 60 && (m[1] === undefined || Number(m[2]) < 60))
    return Number(m[1] || 0) * 3600 + Number(m[2]) * 60 + Number(m[3]);
  return NaN;
}

function fmtDuration(sec) {
  const t = Math.round(sec), h = Math.floor(t / 3600), m = Math.floor(t / 60) % 60, s = t % 60;
  return (h ? `${h}:${String(m).padStart(2, '0')}` : `${m}`) + `:${String(s).padStart(2, '0')}`;
}

// Filter model. Bounds are inclusive numbers or null (no bound).
const NO_FILTER = Object.freeze({ type: 'all', minW: null, maxW: null, minH: null, maxH: null, minLen: null, maxLen: null });
const hasSizeBound = f => f.minW !== null || f.maxW !== null || f.minH !== null || f.maxH !== null;
const hasLenBound  = f => f.minLen !== null || f.maxLen !== null;
const filterActive = f => f.type !== 'all' || hasSizeBound(f) || hasLenBound(f);
const needsMeta    = f => hasSizeBound(f) || hasLenBound(f);
const inRange = (v, lo, hi) => (lo === null || v >= lo) && (hi === null || v <= hi);

// Does an entry pass? A size bound only applies to images and a length bound
// only to audio; setting bounds for one kind alone hides the other kind (asking
// for "width ≥ 640" means "images that wide"). meta: {w,h} | {dur} | null.
// Returns true / false, or null when the answer needs meta that is not known yet.
function filterMatch(entry, meta, f) {
  const size = hasSizeBound(f), len = hasLenBound(f);
  if (entry.isAudio) {
    if (f.type === 'image') return false;
    if (!len) return !size;
    if (!meta) return null;
    return meta.dur !== undefined && inRange(meta.dur, f.minLen, f.maxLen);
  }
  if (f.type === 'audio') return false;
  if (!size) return !len;
  if (!meta) return null;
  return meta.w !== undefined && inRange(meta.w, f.minW, f.maxW) && inRange(meta.h, f.minH, f.maxH);
}

// Short human summary for the toolbar, e.g. "images 48–96 × any px".
function filterSummary(f) {
  const parts = [];
  if (f.type !== 'all') parts.push(f.type === 'image' ? 'images' : 'audio');
  const rng = (lo, hi, fmt = String) => lo === null && hi === null ? 'any'
    : lo === null ? `≤ ${fmt(hi)}` : hi === null ? `≥ ${fmt(lo)}` : lo === hi ? fmt(lo) : `${fmt(lo)}–${fmt(hi)}`;
  if (hasSizeBound(f)) parts.push(`${rng(f.minW, f.maxW)} × ${rng(f.minH, f.maxH)} px`);
  if (hasLenBound(f)) parts.push(rng(f.minLen, f.maxLen, fmtDuration));
  return parts.join(', ');
}

// ── Reading headers ──

// Random access to an entry's decrypted bytes: { size, read(offset, length) }.
// MV/MZ files carry a 16-byte header and only their first 16 data bytes are
// encrypted, so reads past those come straight from the file.
async function entryReader(entry) {
  if (entry._getData) {
    const data = new Uint8Array(await entry._getData());
    return { size: data.length, read: async (o, n) => data.subarray(o, o + n) };
  }
  const file = await entryFile(entry);
  const enc = ENC_IMAGE_EXT.test(entry.name) || ENC_AUDIO_EXT.test(entry.name);
  const base = enc ? 16 : 0;
  const size = Math.max(0, file.size - base);
  return {
    size,
    read: async (o, n) => {
      n = Math.max(0, Math.min(n, size - o));
      if (enc && o < 16) return new Uint8Array(decryptWithKey(await file.slice(0, base + o + n).arrayBuffer())).subarray(o, o + n);
      return new Uint8Array(await file.slice(base + o, base + o + n).arrayBuffer());
    },
  };
}

// {w, h} for an image, {dur} for audio, or null when the header is not understood.
async function readMeta(entry) {
  const r = await entryReader(entry);
  const head = await r.read(0, META_HEAD);
  if (!entry.isAudio) {
    const s = imageSize(head);
    return s ? { w: s.w, h: s.h } : null;
  }
  let dur = null;
  if (head[0] === 0x4f && head[1] === 0x67) {     // "Og": Ogg
    const tail = r.size <= META_HEAD ? head : await r.read(Math.max(0, r.size - META_TAIL), META_TAIL);
    dur = oggDuration(head, tail);
  } else {
    dur = await mp4Duration(r.read, r.size);
  }
  return dur !== null && isFinite(dur) ? { dur } : null;
}

// ── Filter state and the background reader ──

const Filter = {
  f: { ...NO_FILTER },
  gen: 0,
  meta: new Map(),      // path → {w,h} | {dur}
  failed: new Set(),    // paths whose header could not be read or understood
  inFlight: new Set(),
  workers: 0,
  running: false,
  _timer: 0,
  _shown: '',
  _shownAt: 0,

  get active() { return filterActive(this.f); },

  // New library or new key: forget what was read, keep the filter.
  reset() {
    this.gen++;
    this.meta = new Map();
    this.failed = new Set();
    this.inFlight = new Set();
    this.workers = 0;
    this.running = false;
    this._shown = '';
    clearTimeout(this._timer); this._timer = 0;
  },

  set(f) {
    this.f = { ...NO_FILTER, ...f };
    if (needsMeta(this.f)) this.start();
    syncFilterButton();
    if (S.currentFolder) showFolder(S.currentFolder);
  },

  done(path) { return this.meta.has(path) || this.failed.has(path); },

  // Known metadata of a path: read from the header, or noted from a decoded thumbnail.
  note(path, m) {
    if (!m || this.meta.has(path)) return;
    this.meta.set(path, m);
    this.failed.delete(path);
    if (needsMeta(this.f)) this._changed();
  },

  // The paths of a folder that pass, how many are still being read and how
  // many could not be read (both hidden: only files proven to match are shown).
  apply(paths) {
    if (!this.active) return { paths, pending: 0, unreadable: 0 };
    const out = [];
    let pending = 0, unreadable = 0;
    for (const p of paths) {
      const e = S.files.get(p);
      if (!e) continue;
      const r = filterMatch(e, this.meta.get(p) || null, this.f);
      if (r) out.push(p);
      else if (r === null) this.failed.has(p) ? unreadable++ : pending++;
    }
    return { paths: out, pending, unreadable };
  },

  // Reads only the folder on screen (re-called by showFolder on every switch).
  start() {
    if (!needsMeta(this.f) || !S.currentFolder || !S.files.size) return;
    if (!this._next()) return;
    this.running = true;
    // Fixed count: a worker with nothing to do exits synchronously, so a
    // `while (workers < N)` loop would respawn it forever.
    for (let n = META_WORKERS - this.workers; n > 0; n--) { this.workers++; this._work(this.gen); }
  },

  _next() {
    const f = this.f, size = hasSizeBound(f), len = hasLenBound(f);
    for (const p of folderPaths(S.currentFolder)) {
      if (this.done(p) || this.inFlight.has(p)) continue;
      const e = S.files.get(p);
      if (!e || (e.isAudio ? !len || f.type === 'image' : !size || f.type === 'audio')) continue;
      return p;
    }
    return null;
  },

  async _work(gen) {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    while (gen === this.gen && needsMeta(this.f)) {
      if (Fg.active) { await wait(120); continue; }
      const path = this._next();
      if (!path) {
        // A lazy folder scan may still be adding files to this folder.
        if (Bg.scan && Bg.scan.files === S.files && !Bg.scan.done) { await wait(500); continue; }
        break;
      }
      this.inFlight.add(path);
      let m = null;
      try { m = await readMeta(S.files.get(path)); } catch {}
      if (gen !== this.gen) return;
      this.inFlight.delete(path);
      if (m) this.meta.set(path, m); else if (!this.meta.has(path)) this.failed.add(path);
      this._changed();
    }
    if (gen !== this.gen) return;
    if (--this.workers === 0) { this.running = false; this._changed(); }
  },

  _changed() {
    if (this._timer) return;
    this._timer = setTimeout(() => { this._timer = 0; this.refresh(); }, 300);
  },

  // What the grid would show: rebuilt only when it changed, at most every
  // second while reading, and never under an open lightbox.
  _sig() {
    if (!this.active || !S.currentFolder) return '';
    const { paths, pending } = this.apply(folderPaths(S.currentFolder));
    return `${S.currentFolder}:${pending}:${paths.join('\n')}`;
  },
  noteShown() { this._shown = this._sig(); this._shownAt = performance.now(); },

  refresh() {
    if (!S.files.size || !S.currentFolder) return;
    const lbOpen = EL.lightbox.classList.contains('open');
    const calm = !this.running || performance.now() - this._shownAt > 1000;
    if (!lbOpen && calm && this._sig() !== this._shown) showFolder(S.currentFolder);
    else { this.decorate(); updateFolderPath(); }
  },

  // Size / length label on cards while a bound is set.
  decorate() {
    const show = needsMeta(this.f);
    for (const card of EL.grid.children) {
      const path = card.dataset.path;
      if (!path) continue;
      const m = this.meta.get(path);
      let b = card.querySelector('.meta-badge');
      const text = !show || !m ? '' : m.dur !== undefined ? fmtDuration(m.dur) : `${m.w}×${m.h}`;
      if (!text) { b?.remove(); continue; }
      if (!b) {
        b = document.createElement('span');
        b.className = 'meta-badge';
        card.querySelector('.card-img').appendChild(b);
      }
      b.textContent = text;
    }
  },

  // Short status for the toolbar path.
  status(pending, unreadable) {
    if (!this.active) return '';
    const parts = [`filter: ${filterSummary(this.f)}`];
    if (pending) parts.push(`reading ${fmtNum(pending)} more…`);
    if (unreadable) parts.push(`${fmtNum(unreadable)} unreadable`);
    return parts.join(', ');
  },
};

// ── Filter panel (toolbar) ──

const FP = {
  btn:    $('filter-btn'),
  panel:  $('filter-panel'),
  minW:   $('flt-minw'),
  maxW:   $('flt-maxw'),
  minH:   $('flt-minh'),
  maxH:   $('flt-maxh'),
  minLen: $('flt-minlen'),
  maxLen: $('flt-maxlen'),
  clear:  $('flt-clear'),
};

function syncFilterButton() {
  if (!FP.btn) return;
  FP.btn.classList.toggle('on', Filter.active);
  FP.btn.setAttribute('aria-label', Filter.active ? `Filter: ${filterSummary(Filter.f)}` : 'Filter by type, size or length');
}

function readFilterPanel() {
  const px = el => {
    const v = el.value.trim();
    const n = v === '' ? null : Number(v);
    const bad = n !== null && !(Number.isInteger(n) && n >= 0);
    el.setAttribute('aria-invalid', bad ? 'true' : 'false');
    return bad ? null : n;
  };
  const sec = el => {
    const n = parseDuration(el.value);
    const bad = Number.isNaN(n);
    el.setAttribute('aria-invalid', bad ? 'true' : 'false');
    return bad ? null : n;
  };
  const type = FP.panel.querySelector('input[name="flt-type"]:checked')?.value || 'all';
  return {
    type,
    minW: px(FP.minW), maxW: px(FP.maxW), minH: px(FP.minH), maxH: px(FP.maxH),
    minLen: sec(FP.minLen), maxLen: sec(FP.maxLen),
  };
}

function openFilterPanel(open) {
  FP.panel.hidden = !open;
  FP.btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  if (open) FP.panel.querySelector('input[name="flt-type"]:checked')?.focus({ preventScroll: true });
}

if (FP.btn) {
  let t = 0;
  FP.btn.addEventListener('click', () => openFilterPanel(FP.panel.hidden));
  FP.panel.addEventListener('input', () => {
    clearTimeout(t);
    t = setTimeout(() => Filter.set(readFilterPanel()), 300);
  });
  FP.panel.addEventListener('change', e => {
    if (e.target.name === 'flt-type') { clearTimeout(t); Filter.set(readFilterPanel()); }
  });
  FP.panel.querySelectorAll('[data-preset]').forEach(b => b.addEventListener('click', () => {
    const [w, h] = b.dataset.preset.split('x');
    FP.minW.value = FP.maxW.value = w;
    FP.minH.value = FP.maxH.value = h;
    FP.panel.querySelector('#flt-type-image').checked = true;
    clearTimeout(t);
    Filter.set(readFilterPanel());
  }));
  FP.clear.addEventListener('click', () => {
    for (const el of [FP.minW, FP.maxW, FP.minH, FP.maxH, FP.minLen, FP.maxLen]) {
      el.value = '';
      el.setAttribute('aria-invalid', 'false');
    }
    FP.panel.querySelector('#flt-type-all').checked = true;
    clearTimeout(t);
    Filter.set({});
  });
  FP.panel.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.stopPropagation(); openFilterPanel(false); FP.btn.focus(); }
  });
  document.addEventListener('pointerdown', e => {
    if (!FP.panel.hidden && !FP.panel.contains(e.target) && !FP.btn.contains(e.target)) openFilterPanel(false);
  });
}

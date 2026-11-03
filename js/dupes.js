// ─── Identical content (roadmap item 8) ───────────────
// Games often ship the same picture or sound effect under several names or
// folders. Each file is hashed with SHA-256 (crypto.subtle, built into the
// browser) AFTER decryption, so an encrypted copy and a plain copy of the same
// asset match. Hashing is opt-in (the toolbar "Unique only" toggle), runs in
// the background and yields to foreground reads: it waits while a thumbnail or
// the lightbox is reading (Fg.active, js/ui.js), as the folder scan does.
// Hashes live in memory only and are dropped with the library.
// Idea from the duplicate detection in BoBoBaSs84/DDS.Tools (see docs/ROADMAP.md);
// the code here is our own and uses no algorithm from it beyond "hash and group".

const DUPES_KEY = '__dupes__';   // virtual sidebar folder: every file that has a copy
const HASH_WORKERS = 2;          // reads in flight: one hashing while the next is read

function hexOf(buf) {
  const u = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < u.length; i++) s += u[i].toString(16).padStart(2, '0');
  return s;
}

async function sha256Hex(data) {
  return hexOf(await crypto.subtle.digest('SHA-256', data));
}

// hashes: Map<path, hex> → Map<hex, path[]> of contents found at 2+ paths.
function dupeGroups(hashes) {
  const by = new Map();
  for (const [p, h] of hashes) {
    const g = by.get(h);
    if (g) g.push(p); else by.set(h, [p]);
  }
  for (const [h, g] of by) if (g.length < 2) by.delete(h);
  return by;
}

// Keeps the first path of each content, in order. Paths not hashed (yet, or
// unreadable) are kept: only proven copies are hidden.
function uniquePaths(paths, hashes) {
  const seen = new Set(), out = [];
  for (const p of paths) {
    const h = hashes.get(p);
    if (h !== undefined) {
      if (seen.has(h)) continue;
      seen.add(h);
    }
    out.push(p);
  }
  return out;
}

// Every path that has a copy, group after group (groups by first path).
function dupeList(groups) {
  return [...groups.values()]
    .map(g => [...g].sort((a, b) => a.localeCompare(b)))
    .sort((a, b) => a[0].localeCompare(b[0]))
    .flat();
}

const Dupes = {
  on: false,            // "Unique only" toggle (and hashing wanted)
  gen: 0,               // bumped on every reset: stale workers stop
  hashes: new Map(),    // path → hex
  byHash: new Map(),    // hex → path[] (all contents, singles too)
  failed: new Set(),    // paths that could not be read
  inFlight: new Set(),
  workers: 0,
  copies: 0,            // paths whose content is also at another path
  running: false,
  _iter: null,
  _timer: 0,
  _shown: '',           // signature of what the grid was rendered with
  _shownAt: 0,

  // New library or new key: forget everything, keep the toggle.
  reset() {
    this.gen++;
    this.hashes = new Map();
    this.byHash = new Map();
    this.failed = new Set();
    this.inFlight = new Set();
    this.workers = 0;
    this.copies = 0;
    this.running = false;
    this._iter = null;
    this._shown = '';
    clearTimeout(this._timer); this._timer = 0;
    if (this.on) this.start();
  },

  setOn(on) {
    this.on = on;
    EL.dupeBtn?.setAttribute('aria-pressed', on ? 'true' : 'false');
    if (on) this.start();
    renderSidebar();
    if (S.currentFolder) showFolder(S.currentFolder);
  },

  get settled() { return this.hashes.size + this.failed.size; },
  done(path) { return this.hashes.has(path) || this.failed.has(path); },
  copiesOf(path) {
    const h = this.hashes.get(path);
    const g = h && this.byHash.get(h);
    return g && g.length > 1 ? g.filter(p => p !== path) : [];
  },
  groups() {
    const out = new Map();
    for (const [h, g] of this.byHash) if (g.length > 1) out.set(h, g);
    return out;
  },
  list() { return dupeList(this.groups()); },

  start() {
    if (!S.files.size) return;
    this.running = true;
    // Fixed count: a worker with nothing to do exits synchronously, so a
    // `while (workers < N)` loop would respawn it forever.
    for (let n = HASH_WORKERS - this.workers; n > 0; n--) { this.workers++; this._work(this.gen); }
    this._changed();
  },

  // The folder on screen first, then the whole library in order.
  _next() {
    const free = p => !this.done(p) && !this.inFlight.has(p) && S.files.has(p);
    const cur = S.currentFolder && S.currentFolder !== DUPES_KEY ? S.folders.get(S.currentFolder) : null;
    if (cur) for (const p of cur) if (free(p)) return p;
    for (let pass = 0; pass < 2; pass++) {
      this._iter ??= S.files.keys();
      for (let r = this._iter.next(); !r.done; r = this._iter.next()) if (free(r.value)) return r.value;
      this._iter = null;   // a finished Map iterator never sees later additions: restart once
    }
    return null;
  },

  async _work(gen) {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    while (gen === this.gen) {
      if (Fg.active) { await wait(120); continue; }
      const path = this._next();
      if (!path) {
        // A lazy folder scan may still be adding files.
        if (Bg.scan && Bg.scan.files === S.files && !Bg.scan.done) { await wait(500); continue; }
        break;
      }
      this.inFlight.add(path);
      let hex = null;
      try { hex = await sha256Hex(await entryBytes(S.files.get(path))); } catch {}
      if (gen !== this.gen) return;
      this.inFlight.delete(path);
      if (hex) this._add(path, hex); else this.failed.add(path);
      this._changed();
    }
    if (gen !== this.gen) return;
    if (--this.workers === 0) { this.running = false; this._changed(); }
  },

  _add(path, hex) {
    this.hashes.set(path, hex);
    const g = this.byHash.get(hex);
    if (!g) { this.byHash.set(hex, [path]); return; }
    g.push(path);
    this.copies += g.length === 2 ? 2 : 1;
  },

  _changed() {
    if (this._timer) return;
    this._timer = setTimeout(() => { this._timer = 0; this.refresh(); }, 300);
  },

  // Signature of the folder on screen: the grid is rebuilt only when what it
  // would show changed, and never under an open lightbox (its index would move).
  _sig() {
    const key = S.currentFolder;
    if (!key || !this.on && key !== DUPES_KEY) return '';
    if (key === DUPES_KEY) return `d:${this.copies}`;
    const paths = S.folders.get(key) || [];
    return `f:${key}:${paths.length}:${paths.every(p => this.done(p)) ? 1 : 0}`;
  },

  noteShown() { this._shown = this._sig(); this._shownAt = performance.now(); },

  refresh() {
    if (!S.files.size) return;
    refreshSidebar();
    const lbOpen = EL.lightbox.classList.contains('open');
    // The Duplicates view grows while hashing: rebuild it at most every 2 s.
    const calm = S.currentFolder !== DUPES_KEY || !this.running || performance.now() - this._shownAt > 2000;
    if (!lbOpen && calm && this._sig() !== this._shown) showFolder(S.currentFolder);
    else { this.decorate(); updateFolderPath(); }
  },

  // ×N badge on cards whose content exists at N paths.
  decorate() {
    for (const card of EL.grid.children) {
      const path = card.dataset.path;
      if (!path) continue;
      const others = this.copiesOf(path);
      let b = card.querySelector('.dupe-badge');
      if (!others.length) { b?.remove(); continue; }
      if (!b) {
        b = document.createElement('span');
        b.className = 'dupe-badge';
        card.querySelector('.card-img').appendChild(b);
      }
      b.textContent = `×${others.length + 1}`;
      b.title = `Same content as:\n${others.slice(0, 8).join('\n')}${others.length > 8 ? `\n… and ${others.length - 8} more` : ''}`;
    }
  },

  // Sidebar row: re-rendered when any of these change.
  sidebarSig() {
    return `${this.on ? 1 : 0}${this.running ? 1 : 0}:${this.copies}:${this.on && this.running ? this.percent() : ''}`;
  },
  percent() { return Math.floor(this.settled / Math.max(1, S.files.size) * 100); },
  sidebarNote() {
    if (this.running) return `Checking ${this.percent()}%`;
    return this.copies ? 'Unique only on' : 'None found';
  },

  // Short status for the toolbar path.
  status() {
    if (!this.on && !this.settled) return '';
    if (this.running) return `checking duplicates ${this.percent()}%`;
    if (!this.settled) return '';
    return this.copies ? `${fmtNum(this.copies)} files have a copy` : 'no duplicates';
  },
};

// ─── Lazy folder scan ─────────────────────────────────
// Opening a game folder through a directory handle (picker, drag & drop) used
// to walk the whole tree and await getFile() for every file before showing
// anything. On a slow disk that took minutes. Now:
//   1. Only the root is listed up front (game/archive detection, key lookup).
//   2. Directories are listed in the background, media folders first, and
//      each one appears in the sidebar as soon as it is listed.
//   3. File objects are resolved lazily: the folder the user is looking at
//      first, then everything else in the background.
// Progress counts resolved files, overall and per folder (S.folderStats).

// Two directory APIs behind one shape: list(dir) → children, file(item) → File,
// child(dir, name, kind) → handle or null.
const FS_HANDLE = {
  async list(dir) {
    const out = [];
    for await (const h of dir.values()) out.push(h);
    return out;
  },
  isDir: h => h.kind === 'directory',
  name:  h => h.name,
  file:  h => h.getFile(),
  async child(dir, name, kind) {
    try { return kind === 'dir' ? await dir.getDirectoryHandle(name) : await dir.getFileHandle(name); }
    catch { return null; }
  },
};

const FS_ENTRY = {
  async list(dir) {
    const reader = dir.createReader(), out = [];
    for (;;) {
      const batch = await new Promise((res, rej) => reader.readEntries(res, rej));
      if (!batch.length) return out;
      out.push(...batch);
    }
  },
  isDir: e => e.isDirectory,
  name:  e => e.name,
  file:  e => new Promise((res, rej) => e.file(res, rej)),
  child(dir, name, kind) {
    return new Promise(res => (kind === 'dir' ? dir.getDirectory : dir.getFile)
      .call(dir, name, {}, res, () => res(null)));
  },
};

// Few listings in flight keep the sidebar filling steadily; getFile() calls are
// pooled as in the benchmark (docs/benchmarks/traverse-handle.md).
// While a thumbnail or the lightbox is reading (Fg.active), indexing pauses
// and listing drops to one request, so a slow disk serves the user first.
// On a slow disk (removable drive, network share) a big pool adds no
// throughput, only a longer queue in front of the user's next read, so the
// pool shrinks once getFile() latency shows the disk is slow.
const LIST_CONCURRENCY      = 4;
const LIST_BUSY             = 1;
const GET_FILE_CONCURRENCY  = 16;
const GET_FILE_SLOW_DISK    = 4;
const SLOW_DISK_MS          = 15;   // average disk time per getFile()
const MEDIA_DIR = /^(img|audio|movies|graphics)$/i;           // children listed early too
const FIRST_DIR = /^(www|img|audio|movies|graphics)$/i;
const LAST_DIR  = /^(\..*|js|data|save|fonts|locales|css|node_modules|swiftshader|lib|plugins)$/i;
const PICTURES_DIR = /(^|\/)img\/pictures$/i;
const ARCHIVE_RE = /\.(rgssad|rgss2a|rgss3a)$/i;

class FolderScan {
  constructor(fs, rootName) {
    this.fs = fs;
    this.rootName = rootName;
    this.files   = new Map();   // becomes S.files on commit
    this.folders = new Map();   // becomes S.folders on commit
    this.stats   = new Map();   // folderKey → {total, ready}
    this.pending = new Map();   // folderKey → entries not resolved yet
    this.queues  = [[], [], []]; // directories to list, by priority
    this.listing = 0;
    this.resolving = 0;
    this.ready   = 0;           // resolved (or failed) files
    this.latency = null;        // ms per getFile(), moving average
    this.failed  = 0;
    this.listed  = false;       // every directory has been listed
    this.done    = false;       // listed and every file resolved
    this.aborted = false;
    this.key = '';              // key of a game at the root (fallback)
    this.keys = new Map();      // game folder path → key, one per System.json found
    this.detectLabel = '';
    this.onChange = null;       // throttled UI hook
    this.onKey    = null;       // a game's key found late (game nested deeper than the root)
    this._timer = 0;
  }

  get found() { return this.files.size; }
  get hasFolder() { return this.folders.size > 0; }

  start(rootItems) {
    this._addItems(rootItems, this.rootName, false);
    this._pumpList();
  }

  abort() {
    this.aborted = true;
    this.queues = [[], [], []];
    this.pending.clear();
    clearTimeout(this._timer);
  }

  // ── Listing ──
  _nextDir() {
    for (const q of this.queues) if (q.length) return q.shift();
    return null;
  }

  _pumpList() {
    if (this.aborted) return;
    while (this.listing < (Fg.active ? LIST_BUSY : LIST_CONCURRENCY)) {
      const job = this._nextDir();
      if (!job) break;
      this.listing++;
      this.fs.list(job.dir)
        .then(items => { if (!this.aborted) this._addItems(items, job.path, job.media); })
        .catch(() => {})   // unreadable directory: skip it, keep the rest
        .finally(() => { this.listing--; this._pumpList(); });
    }
    if (!this.listing && !this.listed && this.queues.every(q => !q.length)) {
      this.listed = true;
      this._checkDone();
      this._changed();
    }
  }

  _addItems(items, dirPath, inMedia) {
    const fs  = this.fs;
    const rel = dirPath.split('/').slice(1);
    const folder = rel.length ? rel.join('/') : '__root__';
    const added = [];
    for (const it of items) {
      const name = fs.name(it);
      if (fs.isDir(it)) {
        const rank = FIRST_DIR.test(name) ? 0 : LAST_DIR.test(name) ? 2 : inMedia ? 0 : 1;
        const job = { dir: it, path: `${dirPath}/${name}`, media: inMedia || MEDIA_DIR.test(name) };
        // img/pictures is what people open first: list it ahead of everything else.
        if (PICTURES_DIR.test(job.path)) this.queues[0].unshift(job); else this.queues[rank].push(job);
      } else if (MEDIA_EXT.test(name)) {
        const path = `${dirPath}/${name}`;
        const isAudio = AUDIO_EXT.test(name);
        const entry = { name, path, isAudio, isImage: !isAudio, _resolve: () => this._resolve(it, folder) };
        this.files.set(path, entry);
        added.push(entry);
      } else if (name === 'System.json' && /^data$/i.test(rel[rel.length - 1] || '')) {
        this._readKey(it, dirPath.slice(0, dirPath.lastIndexOf('/')));
      }
    }
    if (added.length) {
      // Same order as the old depth-first walk within a folder: by name.
      added.sort((a, b) => a.name.localeCompare(b.name));
      this.folders.set(folder, added.map(e => e.path));
      this.stats.set(folder, { total: added.length, ready: 0 });
      this.pending.set(folder, added);
      this._pumpResolve();
    }
    this._changed();
  }

  // `game` is the folder holding data/: files under it use this key. A folder
  // with several games finds one System.json per game.
  async _readKey(item, game) {
    try {
      const json = JSON.parse(await (await this.fs.file(item)).text());
      if (this.aborted) return;
      const key = json.encryptionKey || '';
      if (this.keys.get(game) === key) return;   // already known from detection
      this.keys.set(game, key);
      if (key) this.onKey?.(key);
    } catch {}
  }

  // ── Resolving File objects ──
  _poolSize() {
    // Start small until the disk has shown its speed.
    return this.latency == null || this.latency > SLOW_DISK_MS ? GET_FILE_SLOW_DISK : GET_FILE_CONCURRENCY;
  }

  _resolve(item, folder) {
    const t0 = performance.now(), inFlight = Math.max(1, this.resolving);
    const count = ok => {
      if (this.aborted) return;
      // Round trip divided by requests in flight ≈ disk time per file.
      const ms = (performance.now() - t0) / inFlight;
      this.latency = this.latency == null ? ms : this.latency * 0.8 + ms * 0.2;
      this.ready++;
      if (!ok) this.failed++;
      const st = this.stats.get(folder);
      if (st) st.ready++;
      this._checkDone();
      this._changed();
    };
    return this.fs.file(item).then(f => { count(true); return f; }, e => { count(false); throw e; });
  }

  _take(key) {
    const q = this.pending.get(key);
    if (!q) return null;
    while (q.length) {
      const e = q.shift();
      if (!e._fileP && !e._file) return e;
    }
    this.pending.delete(key);
    return null;
  }

  // The folder on screen goes first, then folders in discovery order.
  _nextEntry() {
    const cur = S.files === this.files ? S.currentFolder : null;
    if (cur) { const e = this._take(cur); if (e) return e; }
    for (const k of this.pending.keys()) { const e = this._take(k); if (e) return e; }
    return null;
  }

  _pumpResolve() {
    while (!this.aborted && !Fg.active && this.resolving < this._poolSize()) {
      const entry = this._nextEntry();
      if (!entry) break;
      this.resolving++;
      entryFile(entry).catch(() => {}).finally(() => { this.resolving--; this._pumpResolve(); });
    }
  }

  // Call when the user switches folder (its files jump the queue) or when
  // foreground reads finish (back to full speed).
  prioritize() { this._pumpList(); this._pumpResolve(); }

  // Something shown in the status view changed outside the scan.
  notify() { this._changed(); }

  _checkDone() {
    if (!this.done && this.listed && this.ready >= this.files.size) {
      this.done = true;
      this._changed();
    }
  }

  _changed() {
    if (this._timer || this.aborted) return;
    this._timer = setTimeout(() => { this._timer = 0; if (!this.aborted) this.onChange?.(this); }, 150);
  }
}

// ─── Game detection without a full walk ───────────────
// Looks up the few files that identify an MV/MZ game, in the root and in www/.
async function detectLazy(fs, root, rootItems) {
  let base = root;
  const www = rootItems.find(it => fs.isDir(it) && /^www$/i.test(fs.name(it)));
  const has = async (dir, sub, file) => {
    const d = dir && await fs.child(dir, sub, 'dir');
    return d ? fs.child(d, file, 'file') : null;
  };
  let sys = await has(base, 'data', 'System.json');
  if (!sys && www) { base = www; sys = await has(base, 'data', 'System.json'); }
  let engine = null;
  if (await has(base, 'js', 'rmmz_core.js')) engine = 'RPG Maker MZ';
  else if (await has(base, 'js', 'rpg_core.js')) engine = 'RPG Maker MV';
  let key = '';
  if (sys) {
    try {
      const json = JSON.parse(await (await fs.file(sys)).text());
      if (json.encryptionKey) key = json.encryptionKey;
    } catch {}
  }
  return { engine, key, hasSystem: !!sys, inWww: base === www && !!www };
}

// ─── Background loading UI ────────────────────────────
// `Bg.scan` is the scan behind the open library. The header chip shows its
// progress while it runs; clicking it reopens the loader as a status view.
const Bg = { scan: null, hideTimer: 0 };

const BG_STEPS = ['detect', 'scan', 'load', 'current'];

function folderLabel(key) { return key === '__root__' ? 'root' : key; }

// Rebuild the loader rows from the scan's state (the loader may have been
// reused by another load since, so nothing is assumed about its rows).
function renderScanLoader(scan) {
  const found = scan.found;
  Loader.title(scan.done ? 'Game folder indexed' : 'Indexing game folder');
  Loader.step('detect', 'done', scan.detectLabel);
  Loader.step('scan', scan.listed ? 'done' : 'active',
    `${fmtNum(scan.folders.size)} folder${scan.folders.size === 1 ? '' : 's'} · ${fmtNum(found)} files`);
  Loader.step('load', scan.done ? 'done' : found ? 'active' : '',
    found ? `${fmtNum(scan.ready)} / ${fmtNum(found)}${scan.failed ? ` · ${fmtNum(scan.failed)} unreadable` : ''}` : '');
  // Thumbnails are read from disk only when they scroll into view, so this
  // counts the cards on screen, not the whole folder.
  const onScreen = S.files === scan.files && S.currentFolder && Thumbs.requested;
  if (onScreen) Loader.step('current', Thumbs.done >= Thumbs.requested ? 'done' : 'active',
    `${fmtNum(Thumbs.done)} / ${fmtNum(Thumbs.requested)}`);
  else Loader.step('current', '', '');
  Loader.progress(scan.ready, found);
  if (scan.done) Loader.finish();
}

function showScanLoader() {
  const scan = Bg.scan;
  if (!scan || Loader.active) return;
  Loader.open({ kind: 'folder', name: scan.rootName, steps: BG_STEPS, view: true });
  Loader.owner = scan;
  renderScanLoader(scan);
}

function updateBgChip(scan) {
  const chip = EL.bgLoad;
  clearTimeout(Bg.hideTimer);
  if (!scan) { chip.hidden = true; return; }
  const pct = scan.found ? Math.floor(scan.ready / scan.found * 100) : 0;
  chip.hidden = false;
  chip.classList.toggle('done', scan.done);
  chip.querySelector('.bg-load-pct').textContent = scan.done ? '' : `${pct}%`;
  chip.querySelector('.bg-load-label').textContent = scan.done ? 'Indexed' : 'Indexing';
  chip.title = scan.done ? 'All files indexed'
    : `Indexing in background: ${fmtNum(scan.ready)} / ${fmtNum(scan.found)} files${scan.listed ? '' : ', still scanning folders'}. Thumbnails load as you scroll.`;
  if (scan.done) Bg.hideTimer = setTimeout(() => { chip.hidden = true; }, 2500);
}

function onScanChange(scan) {
  if (Loader.active && Loader.owner === scan) renderScanLoader(scan);
  if (Bg.scan !== scan || S.files !== scan.files) return;
  updateBgChip(scan);
  EL.countBadge.textContent = S.files.size ? `${S.files.size} items` : '';
  refreshSidebar();
  // Show the first media folder, and move to img/pictures when it turns up
  // (unless the user already chose a folder).
  if (!S.userNav && !EL.lightbox.classList.contains('open')) {
    const want = pickStartFolder(S.folders);
    if (want && want !== S.currentFolder) showFolder(want);
  }
}

// Makes `scan` the background job of the library just committed.
function adoptScan(scan) {
  if (Bg.scan && Bg.scan !== scan) Bg.scan.abort();
  Bg.scan = scan;
  scan.onKey = () => { if (S.files === scan.files) applyKey(); };
  updateBgChip(scan);
}

// An eager load (file list, archive) replaced the library.
function dropScan() {
  Bg.scan?.abort();
  Bg.scan = null;
  updateBgChip(null);
}

EL.bgLoad.addEventListener('click', showScanLoader);

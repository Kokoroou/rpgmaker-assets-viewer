// ─── DOM helpers ──────────────────────────────────────
const $ = id => document.getElementById(id);

const EL = {
  openBtn:          $('open-btn'),
  themeToggle:      $('theme-toggle'),
  folderInput:      $('folder-input'),
  rgssadInput:      $('rgssad-input'),
  filesInput:       $('files-input'),
  sidebar:          $('sidebar'),
  setup:            $('setup'),
  setupStatus:      $('setup-status'),
  toolbar:          $('toolbar'),
  folderPath:       $('folder-path'),
  gridWrap:         $('grid-wrap'),
  grid:             $('grid'),
  emptySearch:      $('empty-search'),
  emptyIcon:        $('empty-icon'),
  emptyMsg:         $('empty-msg'),
  emptySub:         $('empty-sub'),
  searchBox:        $('search-box'),
  sizeSlider:       $('size-slider'),
  countBadge:       $('count-badge'),
  bgLoad:           $('bg-load'),
  switchTool:       $('switch-tool'),
  dlFolderBtn:      $('dl-folder-btn'),
  dupeBtn:          $('dupe-btn'),
  lightbox:         $('lightbox'),
  lbImg:            $('lb-img'),
  lbAudio:          $('lb-audio'),
  lbSprite:         $('lb-sprite'),
  lbSpriteOn:       $('lb-sprite-on'),
  lbSpriteChar:     $('lb-sprite-char'),
  lbSpriteDir:      $('lb-sprite-dir'),
  lbSpriteCv:       $('lb-sprite-cv'),
  lbLoop:           $('lb-loop'),
  lbLoopOn:         $('lb-loop-on'),
  lbLoopInfo:       $('lb-loop-info'),
  lbName:           $('lb-name'),
  lbMeta:           $('lb-meta'),
  lbImgWrap:        $('lb-img-wrap'),
  lbClose:          $('lb-close'),
  lbPrev:           $('lb-prev'),
  lbNext:           $('lb-next'),
  lbCounter:        $('lb-counter'),
  lbDownload:       $('lb-download'),
};

// ─── Inline SVG icons (no emoji: consistent rendering across OSes) ──
const ICONS = {
  folder:     '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7.5A2.5 2.5 0 015.5 5H9l2 2.5h7.5A2.5 2.5 0 0121 10v7.5a2.5 2.5 0 01-2.5 2.5h-13A2.5 2.5 0 013 17.5z"/></svg>',
  folderOpen: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 17V7.5A2.5 2.5 0 015.5 5H9l2 2.5h6A2.5 2.5 0 0119.5 10v.5"/><path d="M3 17l2.2-5.6A2 2 0 017.1 10H20a1 1 0 01.9 1.4l-2.4 6A2.5 2.5 0 0116.2 19H5a2 2 0 01-2-2z"/></svg>',
  search:     '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/></svg>',
  copies:     '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2h2"/></svg>',
  music:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/></svg>',
};

// ─── Lightbox zoom state ──────────────────────────────
let _lbZ = 1, _lbTx = 0, _lbTy = 0;
let _lbPanning = false, _lbPx = 0, _lbPy = 0;
let _lbMdx = 0, _lbMdy = 0;
let _lbGeneration = 0;
const _preloadPool = new Map(); // path → Image, keeps decoded bitmaps alive

function _lbApply() {
  EL.lbImg.style.transform = `translate(${_lbTx}px,${_lbTy}px) scale(${_lbZ})`;
  EL.lbImg.classList.toggle('zoomed', _lbZ > 1);
}

function _lbReset() {
  _lbZ = 1; _lbTx = 0; _lbTy = 0; _lbPanning = false;
  EL.lbImg.style.transform = '';
  EL.lbImg.classList.remove('zoomed', 'grabbing');
}

// ─── Intersection Observer (lazy image loading) ───────
const obs = new IntersectionObserver(entries => {
  for (const e of entries) {
    if (e.isIntersecting && e.target._load) {
      e.target._load();
      delete e.target._load;
      obs.unobserve(e.target);
    }
  }
}, { rootMargin: '200px' });

// ─── Foreground reads ─────────────────────────────────
// Thumbnails and the lightbox are what the user is waiting for. While any of
// them is reading a file, the background scan (js/scan.js) throttles itself so
// on a slow disk these reads are not queued behind its requests.
const Fg = { active: 0 };
function fgStart() {
  Fg.active++;
  let ended = false;
  return () => {
    if (ended) return;
    ended = true;
    Fg.active--;
    if (!Fg.active) Bg.scan?.prioritize();
  };
}

// Thumbnails of the folder on screen: requested = cards scrolled into view,
// done = decoded or failed. Shown in the loader's status view.
// `ends` releases cards dropped before their image decoded (folder switch).
const Thumbs = { gen: 0, requested: 0, done: 0, ends: new Set() };

// ─── URL resolution ───────────────────────────────────
// File for a folder entry. Lazy scans (js/scan.js) give entries a `_resolve`
// instead of a File; the promise is shared, so a tile and the background
// loader never fetch the same file twice.
function entryFile(entry) {
  if (entry._file) return Promise.resolve(entry._file);
  return entry._fileP ??= entry._resolve().then(f => (entry._file = f));
}

async function entryToURL(entry) {
  if (S.blobCache.has(entry.path)) return S.blobCache.get(entry.path);
  let data, url;
  if (entry._getData) {
    data = await entry._getData();
    if (entry.isAudio) entry._loop = parseOggLoop(data);
    url  = URL.createObjectURL(new Blob([data], { type: getMimeType(entry.name) }));
  } else if (ENC_IMAGE_EXT.test(entry.name) || ENC_AUDIO_EXT.test(entry.name)) {
    data = decryptWithKey(await (await entryFile(entry)).arrayBuffer(), entry.path);
    if (entry.isAudio) entry._loop = parseOggLoop(data);
    url  = URL.createObjectURL(new Blob([data], { type: getMimeType(entry.name) }));
  } else {
    const file = await entryFile(entry);
    if (entry.isAudio) entry._loop = parseOggLoop(await file.slice(0, 262144).arrayBuffer());
    url = URL.createObjectURL(file);
  }
  S.blobCache.set(entry.path, url);
  return url;
}

// Decrypted bytes of an entry (ZIP export, duplicate hashing). Unlike
// entryToURL nothing is cached: callers read each file once.
async function entryBytes(entry) {
  if (entry._getData) return new Uint8Array(await entry._getData());
  const buf = await (await entryFile(entry)).arrayBuffer();
  if (ENC_IMAGE_EXT.test(entry.name) || ENC_AUDIO_EXT.test(entry.name))
    return new Uint8Array(decryptWithKey(buf, entry.path));
  return new Uint8Array(buf);
}

// Encryption key for a file. A folder may hold several games, each with its own
// key (S.keys: game folder path → key, from its data/System.json); the deepest
// game folder containing the path wins, S.key is the fallback.
function keyFor(path) {
  let best = -1, key = S.key;
  for (const [prefix, k] of S.keys) {
    if (prefix.length > best && path.startsWith(prefix + '/')) { best = prefix.length; key = k; }
  }
  return key;
}

// Game folder a derived key belongs to: everything before [www/]img|audio.
function gameFolderOf(path) {
  const m = /^(.*?)\/(?:www\/)?(?:img|audio)\//i.exec(path);
  return m ? m[1] : null;
}

// Decrypt an MV/MZ buffer with the key of `path`'s game. If no key is known
// (System.json missing), derive it from this file when it is an encrypted
// image; the key stays in memory only.
function decryptWithKey(buffer, path) {
  let key = path == null ? S.key : keyFor(path);
  if (!key) {
    key = deriveKeyFromPNG(buffer);
    if (!key) throw new Error('No encryption key set');
    const game = path == null ? null : gameFolderOf(path);
    if (game != null) S.keys.set(game, key); else S.key = key;
  }
  return decryptMVMZ(buffer, key);
}

function clearBlobCache() {
  S.blobCache.forEach(u => URL.revokeObjectURL(u));
  S.blobCache.clear();
  _preloadPool.clear();
}

// ─── Key ──────────────────────────────────────────────
// A game's key turned up after its files were listed: redraw with it.
function applyKey(key) {
  if (key) S.key = key;
  clearBlobCache();
  Dupes.reset();   // encrypted files hash differently once decrypted with the right key
  Filter.reset();
  if (S.currentFolder) showFolder(S.currentFolder);
}

// ─── Sidebar drill-down ───────────────────────────────
function _sbChildren(sPath) {
  const seen = new Set();
  if (!sPath) {
    if (S.folders.has('__root__')) seen.add('__root__');
    for (const k of S.folders.keys()) {
      if (k === '__root__') continue;
      seen.add(k.split('/')[0]); // first segment = top-level child
    }
  } else if (sPath !== '__root__') {
    const prefix = sPath + '/';
    for (const k of S.folders.keys()) {
      if (!k.startsWith(prefix)) continue;
      const child = k.slice(prefix.length).split('/')[0]; // immediate child segment
      seen.add(sPath + '/' + child);
    }
  }
  return [...seen].sort((a, b) => {
    if (a === '__root__') return -1;
    if (b === '__root__') return 1;
    return a.localeCompare(b);
  });
}

function _sbParent(sPath) {
  if (!sPath || sPath === '__root__') return null;
  const parts = sPath.split('/');
  return parts.length === 1 ? null : parts.slice(0, -1).join('/');
}

function _sbHasKids(key) {
  if (key === '__root__') return false;
  const prefix = key + '/';
  for (const k of S.folders.keys()) if (k.startsWith(prefix)) return true;
  return false;
}

// Files resolved / total for a folder and everything below it, while a lazy
// scan is still loading them; null when there is nothing left to load.
function folderProgress(key) {
  const stats = S.folderStats;
  if (!stats) return null;
  let total = 0, ready = 0;
  const prefix = key + '/';
  for (const [k, st] of stats) {
    if (k === key || (key !== '__root__' && k.startsWith(prefix))) { total += st.total; ready += st.ready; }
  }
  return total && ready < total ? { ready, total } : null;
}

// Pending folders get a faint fill behind the row that grows with progress.
function decorateFolderItems() {
  for (const el of EL.sidebar.querySelectorAll('.folder-item')) {
    const p = folderProgress(el.dataset.folder);
    el.classList.toggle('pending', !!p);
    if (p) {
      el.style.setProperty('--p', (p.ready / p.total * 100).toFixed(1) + '%');
      el.title = `Indexing ${fmtNum(p.ready)} / ${fmtNum(p.total)} files`;
    } else {
      el.style.removeProperty('--p');
      el.removeAttribute('title');
    }
  }
}

// Re-render only when the folders at the current level changed (a background
// scan calls this often), otherwise just update the progress fills.
let _sbSig = '';
function _sidebarSig() {
  const sPath = S.sidebarPath;
  const keys  = _sbChildren(sPath);
  if (sPath) keys.unshift(sPath);
  return sPath + '|' + (sPath ? '' : Dupes.sidebarSig()) + '|' + keys.map(k => `${k}:${(S.folders.get(k) || []).length}:${_sbHasKids(k) ? 1 : 0}`).join(',');
}

function refreshSidebar() {
  if (_sidebarSig() !== _sbSig) renderSidebar();
  else decorateFolderItems();
}

function renderSidebar() {
  const sPath    = S.sidebarPath;
  const children = _sbChildren(sPath);
  const parent   = _sbParent(sPath);
  _sbSig = _sidebarSig();

  EL.sidebar.innerHTML = '';

  // Header / back button
  const hdr = document.createElement('div');
  hdr.id = 'sidebar-header';
  if (parent !== null || sPath) {
    const backLabel = parent ? parent.split('/').pop() : 'Folders';
    hdr.innerHTML = `<button id="sb-back"><svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M7 2L3.5 5.5 7 9" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>${escapeHtml(backLabel)}</button>`;
    hdr.querySelector('#sb-back').addEventListener('click', () => {
      S.sidebarPath = parent;
      renderSidebar();
    });
  } else {
    hdr.textContent = 'Folders';
  }
  EL.sidebar.appendChild(hdr);

  // Current folder row (when drilled in)
  if (sPath) {
    const cur  = document.createElement('div');
    const lbl  = sPath === '__root__' ? '(root)' : sPath.split('/').pop();
    const cnt  = (S.folders.get(sPath) || []).length;
    cur.className = 'folder-item folder-current';
    cur.dataset.folder = sPath;
    cur.innerHTML = `<span class="f-icon">${ICONS.folderOpen}</span><span class="f-name">${escapeHtml(lbl)}</span>${cnt ? `<span class="f-count">${cnt}</span>` : ''}`;
    cur.addEventListener('click', () => { S.userNav = true; showFolder(sPath); });
    if (S.currentFolder === sPath) cur.classList.add('active');
    EL.sidebar.appendChild(cur);

    if (children.length) {
      const div = document.createElement('div');
      div.className = 'sb-divider';
      EL.sidebar.appendChild(div);
    }
  }

  // Virtual "Duplicates" folder (js/dupes.js): shown once copies are found,
  // and from the moment "Unique only" is on, highlighted and set apart from
  // the real folders so the toggle's result is easy to find.
  if (!sPath && (Dupes.on || Dupes.copies)) {
    const item = document.createElement('div');
    item.className = 'folder-item folder-dupes' + (Dupes.on ? ' on' : '');
    item.dataset.folder = DUPES_KEY;
    const sub   = Dupes.on ? Dupes.sidebarNote() : '';
    const count = Dupes.running && !Dupes.copies ? '<span class="status-spinner" aria-hidden="true"></span>'
                : `<span class="f-count">${fmtNum(Dupes.copies)}</span>`;
    item.innerHTML = `<span class="f-icon">${ICONS.copies}</span>`
      + `<span class="f-name">Duplicates${sub ? `<span class="f-sub">${escapeHtml(sub)}</span>` : ''}</span>${count}`;
    item.title = 'Files whose content also exists at another path';
    item.addEventListener('click', () => { S.userNav = true; showFolder(DUPES_KEY); });
    if (S.currentFolder === DUPES_KEY) item.classList.add('active');
    EL.sidebar.appendChild(item);
    const div = document.createElement('div');
    div.className = 'sb-divider';
    EL.sidebar.appendChild(div);
  }

  // Child folders
  for (const key of children) {
    const hasKids = _sbHasKids(key);
    const lbl     = key === '__root__' ? '(root)' : key.split('/').pop();
    const cnt     = (S.folders.get(key) || []).length;

    const item = document.createElement('div');
    item.className = 'folder-item';
    item.dataset.folder = key;
    item.innerHTML = `
      <span class="f-icon">${ICONS.folder}</span>
      <span class="f-name">${escapeHtml(lbl)}</span>
      ${cnt ? `<span class="f-count">${cnt}</span>` : ''}
      ${hasKids ? `<svg class="f-drill" width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M3.5 2l3 3-3 3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>` : ''}`;
    item.addEventListener('click', () => {
      S.userNav = true;
      showFolder(key);
      if (hasKids) { S.sidebarPath = key; renderSidebar(); }
    });
    if (S.currentFolder === key) item.classList.add('active');
    EL.sidebar.appendChild(item);
  }
  decorateFolderItems();
}

function setActiveFolder(key) {
  EL.sidebar.querySelectorAll('.folder-item').forEach(el =>
    el.classList.toggle('active', el.dataset.folder === key));
}

// ─── Grid ─────────────────────────────────────────────
function showEmptyState(icon, msg, sub) {
  EL.emptySearch.style.display = 'flex';
  EL.emptyIcon.innerHTML   = ICONS[icon] || ICONS.search;
  EL.emptyMsg.textContent  = msg;
  EL.emptySub.textContent  = sub;
}

function showFolder(key) {
  S.currentFolder = key;
  setActiveFolder(key);
  Bg.scan?.prioritize();   // background loader: this folder's files first
  const all      = folderPaths(key);
  const q        = S.query.toLowerCase();
  const matched  = q ? all.filter(p => p.toLowerCase().includes(q)) : all;
  const unique   = Dupes.on ? uniquePaths(matched, Dupes.hashes) : matched;
  S.hiddenCopies = matched.length - unique.length;
  Filter.start();   // reads sizes / lengths of this folder if a bound is set
  const fr       = Filter.apply(unique);
  const filtered = fr.paths;
  S.currentMedia = filtered;
  S.filterPending = fr.pending;
  S.filterUnreadable = fr.unreadable;

  updateFolderPath();
  EL.grid.innerHTML = '';
  Thumbs.gen++;
  Thumbs.requested = Thumbs.done = 0;
  for (const end of Thumbs.ends) end();
  Thumbs.ends.clear();

  if (filtered.length === 0) {
    if (Filter.active && fr.pending) {
      showEmptyState('search', 'Reading sizes and lengths…', 'Matching files appear as they are checked');
    } else if (Filter.active && unique.length) {
      showEmptyState('search', 'No files match the filter', q ? 'Try a different keyword or widen the filter' : 'Widen the ranges or clear the filter');
    } else if (q) {
      showEmptyState('search', 'No items found', 'Try a different keyword');
    } else if (key === DUPES_KEY) {
      showEmptyState('folderOpen', Dupes.running ? 'Checking for duplicates…' : 'No duplicates found',
        Dupes.running ? 'Files with identical content will appear here' : 'Every file in this game has unique content');
    } else {
      showEmptyState('folderOpen', 'No media files in this folder', 'Only images and audio are shown');
    }
  } else {
    EL.emptySearch.style.display = 'none';
  }

  if (EL.dlFolderBtn) EL.dlFolderBtn.disabled = filtered.length === 0;

  filtered.forEach((path, i) => {
    const entry = S.files.get(path);
    if (entry) EL.grid.appendChild(makeCard(entry, i));
  });
  Dupes.noteShown();
  Dupes.decorate();
  Filter.noteShown();
  Filter.decorate();
}

// Paths of a sidebar folder; the virtual Duplicates folder is computed.
function folderPaths(key) {
  return key === DUPES_KEY ? Dupes.list() : S.folders.get(key) || [];
}

function updateFolderPath() {
  const key = S.currentFolder;
  if (!key) return;
  const label = key === '__root__' ? 'root' : key === DUPES_KEY ? 'Duplicates' : key;
  const n = S.currentMedia.length;
  const parts = [`${fmtNum(n)} item${n === 1 ? '' : 's'}`];
  if (S.hiddenCopies) parts.push(`${fmtNum(S.hiddenCopies)} cop${S.hiddenCopies === 1 ? 'y' : 'ies'} hidden`);
  const st = Dupes.status();
  if (st) parts.push(st);
  const ft = Filter.status(S.filterPending, S.filterUnreadable);
  if (ft) parts.push(escapeHtml(ft));
  EL.folderPath.innerHTML = `<strong>${escapeHtml(label)}</strong> &ensp;·&ensp; ${parts.join(' &ensp;·&ensp; ')}`;
}

function makeCard(entry, idx) {
  const card     = document.createElement('div');
  card.dataset.path = entry.path;
  const baseName = entry.name.split('/').pop();
  const dispName = canonicalExt(baseName);
  const safeName = escapeHtml(dispName);

  if (entry.isAudio) {
    card.className = 'card audio-card';
    card.innerHTML = `
      <div class="card-img audio-thumb"><div class="audio-icon">${ICONS.music}</div></div>
      <div class="card-name" title="${escapeHtml(entry.path)}">${safeName}</div>`;
  } else {
    card.className = 'card loading';
    card.innerHTML = `
      <div class="card-img"></div>
      <div class="card-name" title="${escapeHtml(entry.path)}">${safeName}</div>`;
    const wrap = card.querySelector('.card-img');
    const gen = Thumbs.gen;
    card._load = async () => {
      const end = fgStart();   // until decoded: plain images are read by <img>
      Thumbs.ends.add(end);
      Thumbs.requested++;
      const settle = ok => {
        end();
        if (ok) { const im = wrap.querySelector('img'); if (im) Filter.note(entry.path, { w: im.naturalWidth, h: im.naturalHeight }); }
        Thumbs.ends.delete(end);
        card.classList.remove('loading');
        card.classList.toggle('error', !ok);
        if (gen === Thumbs.gen) { Thumbs.done++; Bg.scan?.notify(); }
      };
      try {
        const url = await entryToURL(entry);
        const img = document.createElement('img');
        img.src = url;
        img.alt = dispName;
        img.addEventListener('load',  () => settle(true));
        img.addEventListener('error', () => settle(false));
        wrap.appendChild(img);
      } catch { settle(false); }
      Bg.scan?.notify();
    };
    obs.observe(card);
  }

  card.tabIndex = 0;
  card.setAttribute('role', 'button');
  card.setAttribute('aria-label', `Preview ${dispName}`);
  card.addEventListener('click', () => openLightbox(idx));
  card.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openLightbox(idx); }
  });
  return card;
}

// ─── Lightbox ─────────────────────────────────────────
// The open lightbox owns one history entry, so the phone's Back button or
// back gesture closes it instead of leaving the page. Same URL, no hash:
// nothing about the file reaches the address bar or analytics.
const LB_STATE = 'makerlens-lightbox';

async function openLightbox(idx) {
  _lbReset();
  S.lbIdx = idx;
  if (!EL.lightbox.classList.contains('open') && history.state !== LB_STATE) {
    try { history.pushState(LB_STATE, ''); } catch (_) {}
  }
  EL.lightbox.classList.add('open');
  await loadLbEntry(idx);
}

function closeLightbox() {
  _lbClose();
  if (history.state === LB_STATE) history.back();   // popstate finds it closed
}

window.addEventListener('popstate', () => {
  if (EL.lightbox.classList.contains('open') && history.state !== LB_STATE) _lbClose();
});

function _lbClose() {
  _lbSwipeEnd();
  _spriteStop();
  EL.lbAudio.pause();
  EL.lightbox.classList.remove('open');
  _lbReset();
  Dupes.refresh();   // a grid rebuild may have waited for the lightbox to close
  Filter.refresh();
}

function lbMove(d) {
  _lbReset();
  const n = S.currentMedia.length;
  S.lbIdx = (S.lbIdx + d + n) % n;
  loadLbEntry(S.lbIdx);
}

async function preloadAround(idx) {
  const n = S.currentMedia.length;
  for (let d = 1; d <= 3; d++) {
    for (const sign of [-1, 1]) {
      const i = (idx + d * sign + n) % n;
      const path = S.currentMedia[i];
      if (_preloadPool.has(path)) continue;
      const entry = S.files.get(path);
      if (!entry || entry.isAudio) continue;
      try {
        const url = await entryToURL(entry);
        const img = new Image();
        img.src = url;
        img.decode().catch(() => {});
        _preloadPool.set(path, img);
      } catch (_) {}
    }
  }
}

async function loadLbEntry(idx) {
  const end = fgStart();
  try { await _loadLbEntry(idx); } finally { end(); }
}

async function _loadLbEntry(idx) {
  const gen = ++_lbGeneration;
  const path  = S.currentMedia[idx];
  if (!path) return;
  const entry = S.files.get(path);
  if (!entry) return;

  const dispName = canonicalExt(entry.name.split('/').pop());
  EL.lbName.textContent    = dispName;
  EL.lbMeta.textContent    = '';
  const copies = Dupes.copiesOf(path);
  EL.lbMeta.title = copies.length ? `Same content as:\n${copies.join('\n')}` : '';
  EL.lbCounter.textContent = `${idx + 1} / ${S.currentMedia.length}`;
  EL.lbDownload.dataset.path = path;
  _spriteStop();
  EL.lbSprite.style.display = 'none';

  if (entry.isAudio) {
    EL.lbImg.style.display   = 'none';
    EL.lbAudio.style.display = 'block';
    EL.lbAudio.src = '';
    EL.lbLoop.style.display = 'none';
    _loopPts = null;
    try {
      const url = await entryToURL(entry);
      if (gen !== _lbGeneration) return;
      _setupLoop(entry._loop);
      EL.lbAudio.src = url;
      EL.lbAudio.play().catch(() => {});
      EL.lbAudio.addEventListener('loadedmetadata', () => {
        const d = EL.lbAudio.duration;
        if (!isFinite(d)) return;
        const m = Math.floor(d / 60);
        const s = Math.floor(d % 60);
        EL.lbMeta.textContent = `${m}:${s.toString().padStart(2, '0')}` + copyNote(copies);
        Filter.note(path, { dur: d });
      }, { once: true });
    } catch (e) {
      EL.lbMeta.textContent = `⚠ ${e.message}`;
    }
  } else {
    EL.lbAudio.pause();
    EL.lbAudio.style.display = 'none';
    EL.lbLoop.style.display  = 'none';
    _loopPts = null;
    EL.lbImg.style.display   = 'block';
    EL.lbImg.style.opacity   = '0';
    try {
      const url = await entryToURL(entry);
      if (gen !== _lbGeneration) return;
      EL.lbImg.src = url;
      await EL.lbImg.decode();
      if (gen !== _lbGeneration) return;
      EL.lbImg.style.opacity = '1';
      EL.lbMeta.textContent  = `${EL.lbImg.naturalWidth} × ${EL.lbImg.naturalHeight} px` + copyNote(copies);
      Filter.note(path, { w: EL.lbImg.naturalWidth, h: EL.lbImg.naturalHeight });
      _spriteOffer(entry);
    } catch (e) {
      if (gen !== _lbGeneration) return;
      EL.lbImg.style.opacity = '1';
      EL.lbMeta.textContent  = `⚠ ${e.message}`;
    }
  }

  preloadAround(idx);
}

const copyNote = c => c.length ? ` · ${c.length + 1} identical copies` : '';

// ─── Character sprite animation (js/sprite.js) ───
let _spriteLayout = null, _spriteRaf = 0, _spriteT0 = 0;

function _spriteOffer(entry) {
  const name = entry.name.split('/').pop();
  const inChars = /(^|\/)characters\//i.test(entry.path);
  _spriteLayout = inChars ? spriteLayout(name, EL.lbImg.naturalWidth, EL.lbImg.naturalHeight) : null;
  EL.lbSprite.style.display = _spriteLayout ? '' : 'none';
  if (!_spriteLayout) return;
  EL.lbSpriteChar.innerHTML = '';
  for (let i = 0; i < _spriteLayout.chars; i++) EL.lbSpriteChar.add(new Option(`Character ${i + 1}`, i));
  EL.lbSpriteChar.style.display = _spriteLayout.chars > 1 ? '' : 'none';
  EL.lbSpriteOn.checked = false;
}

function _spriteStop() {
  cancelAnimationFrame(_spriteRaf); _spriteRaf = 0;
  EL.lbSpriteCv.style.display = 'none';
  if (EL.lbSpriteOn.checked) EL.lbSpriteOn.checked = false;
  if (EL.lbAudio.style.display === 'none') EL.lbImg.style.display = 'block';
}

function _spriteDraw(t) {
  if (!_spriteLayout) return;
  const step = Math.floor((t - _spriteT0) / 160);   // ~6 steps/s, cycle 0,1,2,1
  const f = spriteFrame(_spriteLayout, +EL.lbSpriteChar.value || 0, +EL.lbSpriteDir.value || 0, step);
  const cv = EL.lbSpriteCv, scale = Math.max(1, Math.floor(Math.min(320 / f.sw, 320 / f.sh)));
  if (cv.width !== f.sw || cv.height !== f.sh) { cv.width = f.sw; cv.height = f.sh; }
  cv.style.width = f.sw * scale + 'px'; cv.style.height = f.sh * scale + 'px';
  const g = cv.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.clearRect(0, 0, f.sw, f.sh);
  g.drawImage(EL.lbImg, f.sx, f.sy, f.sw, f.sh, 0, 0, f.sw, f.sh);
  _spriteRaf = requestAnimationFrame(_spriteDraw);
}

EL.lbSpriteOn.addEventListener('change', () => {
  cancelAnimationFrame(_spriteRaf); _spriteRaf = 0;
  if (EL.lbSpriteOn.checked && _spriteLayout) {
    EL.lbImg.style.display = 'none';
    EL.lbSpriteCv.style.display = 'block';
    _spriteT0 = performance.now();
    _spriteRaf = requestAnimationFrame(_spriteDraw);
  } else {
    EL.lbSpriteCv.style.display = 'none';
    EL.lbImg.style.display = 'block';
  }
});

// ─── Audio loop points (LOOPSTART / LOOPLENGTH, see js/audio-loop.js) ───
// Seconds { start, end|null } of the open track, or null when it has none.
let _loopPts = null, _loopRaf = 0;

function _setupLoop(lp) {
  _loopPts = lp ? { start: lp.start / lp.rate, end: lp.end === null ? null : lp.end / lp.rate } : null;
  if (!_loopPts) { EL.lbLoop.style.display = 'none'; return; }
  EL.lbLoopInfo.textContent = `Loop ${fmtLoopTime(_loopPts.start)} → ` +
    (_loopPts.end === null ? 'end' : fmtLoopTime(_loopPts.end));
  EL.lbLoop.style.display = '';
}

function _loopTick() {
  _loopRaf = 0;
  const a = EL.lbAudio;
  if (_loopPts && EL.lbLoopOn.checked && !a.paused) {
    const end = _loopPts.end ?? a.duration;
    if (a.currentTime >= end) a.currentTime = _loopPts.start;
    _loopRaf = requestAnimationFrame(_loopTick);
  }
}
EL.lbAudio.addEventListener('play', () => { if (!_loopRaf) _loopRaf = requestAnimationFrame(_loopTick); });
EL.lbAudio.addEventListener('ended', () => {
  if (_loopPts && EL.lbLoopOn.checked) { EL.lbAudio.currentTime = _loopPts.start; EL.lbAudio.play().catch(() => {}); }
});
EL.lbLoopOn.addEventListener('change', () => { if (!_loopRaf) _loopRaf = requestAnimationFrame(_loopTick); });

// ─── Lightbox zoom (wheel + drag) ────────────────────
EL.lightbox.addEventListener('wheel', e => {
  if (!EL.lightbox.classList.contains('open') || EL.lbImg.style.display === 'none') return;
  e.preventDefault();
  const rect = EL.lbImg.getBoundingClientRect();
  const mx   = e.clientX - (rect.left + rect.right)  / 2;
  const my   = e.clientY - (rect.top  + rect.bottom) / 2;
  const nz   = Math.max(1, Math.min(8, _lbZ * (e.deltaY < 0 ? 1.2 : 1 / 1.2)));
  if (nz === 1) {
    _lbZ = 1; _lbTx = 0; _lbTy = 0;
  } else {
    const s = nz / _lbZ;
    _lbTx += mx * (1 - s);
    _lbTy += my * (1 - s);
    _lbZ = nz;
  }
  _lbApply();
}, { passive: false });

EL.lbImg.addEventListener('click', e => {
  if (_lbFromTouch()) return;   // touch has its own double-tap below
  if (Math.hypot(e.clientX - _lbMdx, e.clientY - _lbMdy) > 3) return;
  if (_lbZ > 1) { _lbZ = 1; _lbTx = 0; _lbTy = 0; } else { _lbZ = 2; }
  _lbApply();
});

EL.lightbox.addEventListener('mousedown', e => {
  if (_lbFromTouch()) return;
  _lbMdx = e.clientX; _lbMdy = e.clientY;
  if (_lbZ <= 1) return;
  e.preventDefault();
  _lbPanning = true;
  _lbPx = e.clientX - _lbTx;
  _lbPy = e.clientY - _lbTy;
  EL.lbImg.classList.add('grabbing');
});

document.addEventListener('mousemove', e => {
  if (!_lbPanning) return;
  _lbTx = e.clientX - _lbPx;
  _lbTy = e.clientY - _lbPy;
  _lbApply();
});

document.addEventListener('mouseup', () => {
  if (!_lbPanning) return;
  _lbPanning = false;
  EL.lbImg.classList.remove('grabbing');
});

// ─── Lightbox touch (swipe, pinch, double-tap) ───────
// Pointer Events with pointerType 'touch' / 'pen' only; mouse keeps the
// wheel + drag handlers above. Not zoomed: swipe left / right = next /
// previous, swipe down on the media = close. Pinch zooms around the fingers,
// one finger pans while zoomed, double-tap toggles 2.5× at the tapped point.
const _lbPts = new Map();          // pointerId → {x, y}
let _lbG = null;                   // current gesture
let _lbTouchAt = 0, _lbTap = null; // last touch time, last tap {x, y, t}
const _lbWrapEl = EL.lbImgWrap;
const _lbReduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

const _lbFromTouch = () => performance.now() - _lbTouchAt < 800;
const _lbImageOn = () => EL.lbImg.style.display !== 'none' && EL.lbAudio.style.display === 'none';

function _lbClampZ(z) { return Math.max(1, Math.min(8, z)); }

// Layout centre of the image (its centre with the current translate undone).
function _lbCentre() {
  const r = EL.lbImg.getBoundingClientRect();
  return { x: (r.left + r.right) / 2 - _lbTx, y: (r.top + r.bottom) / 2 - _lbTy };
}

// Zoom to nz keeping image point under (px, py) — given the gesture start
// state z0/tx0/ty0 and the start point (sx, sy) — under the finger.
function _lbZoomAt(c, z0, tx0, ty0, sx, sy, nz, px, py) {
  const lx = (sx - c.x - tx0) / z0, ly = (sy - c.y - ty0) / z0;
  _lbZ = nz;
  if (nz === 1) { _lbTx = 0; _lbTy = 0; }
  else { _lbTx = px - c.x - lx * nz; _lbTy = py - c.y - ly * nz; }
  _lbApply();
}

function _lbSwipeSet(dx, dy, fade) {
  _lbWrapEl.style.transform = dx || dy ? `translate(${dx}px,${dy}px)` : '';
  _lbWrapEl.style.opacity = fade < 1 ? String(fade) : '';
}

function _lbSwipeEnd() {
  _lbWrapEl.classList.remove('lb-anim');
  _lbSwipeSet(0, 0, 1);
  EL.lightbox.style.background = '';
}

function _lbSnapBack() {
  _lbWrapEl.classList.add('lb-anim');
  _lbSwipeSet(0, 0, 1);
  EL.lightbox.style.background = '';
  setTimeout(() => _lbWrapEl.classList.remove('lb-anim'), 200);
}

// Slide the current item out, switch, slide the next one in from the other side.
function _lbSwipeTo(d) {
  if (S.currentMedia.length < 2) { _lbSnapBack(); return; }
  if (_lbReduceMotion.matches) { _lbSwipeEnd(); lbMove(d); return; }
  const w = innerWidth;
  _lbWrapEl.classList.add('lb-anim');
  _lbSwipeSet(-d * w, 0, 0);
  setTimeout(() => {
    _lbWrapEl.classList.remove('lb-anim');
    _lbSwipeSet(d * w * 0.3, 0, 0);
    lbMove(d);
    void _lbWrapEl.offsetWidth;          // commit the start position
    _lbWrapEl.classList.add('lb-anim');
    _lbSwipeSet(0, 0, 1);
    setTimeout(() => _lbWrapEl.classList.remove('lb-anim'), 200);
  }, 170);
}

function _lbPinchStart() {
  const [a, b] = [..._lbPts.values()];
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
  _lbSwipeEnd();
  _lbG = { mode: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y) || 1,
           z0: _lbZ, tx0: _lbTx, ty0: _lbTy, sx: mx, sy: my, c: _lbCentre() };
}

function _lbPanStart(p) {
  _lbG = { mode: 'pan', px: p.x - _lbTx, py: p.y - _lbTy };
}

EL.lightbox.addEventListener('pointerdown', e => {
  if (e.pointerType === 'mouse' || !EL.lightbox.classList.contains('open')) return;
  _lbTouchAt = performance.now();
  // Native controls keep their own touch behaviour (seek bar, buttons, selects).
  if (e.target.closest('button, input, select, label, audio, #lb-controls')) return;
  const onMedia = !!e.target.closest('#lb-img-wrap');
  // No setPointerCapture: touch is captured to its target implicitly, and an
  // explicit capture on #lightbox would retarget the click to the backdrop
  // (whose click handler closes the viewer).
  _lbPts.set(e.pointerId, { x: e.clientX, y: e.clientY });

  if (_lbPts.size === 2 && _lbImageOn() && onMedia || _lbPts.size === 2 && _lbG?.mode === 'pinch') {
    _lbPinchStart();
  } else if (_lbPts.size === 1) {
    if (_lbZ > 1 && onMedia) _lbPanStart({ x: e.clientX, y: e.clientY });
    else _lbG = { mode: 'wait', sx: e.clientX, sy: e.clientY, dx: 0, dy: 0 };
    Object.assign(_lbG, { onMedia, t0: performance.now(), x0: e.clientX, y0: e.clientY });
  }
});

EL.lightbox.addEventListener('pointermove', e => {
  const p = _lbPts.get(e.pointerId);
  if (!p || !_lbG) return;
  p.x = e.clientX; p.y = e.clientY;
  const g = _lbG;

  if (g.mode === 'pinch' && _lbPts.size >= 2) {
    const [a, b] = [..._lbPts.values()];
    const nz = _lbClampZ(g.z0 * Math.hypot(a.x - b.x, a.y - b.y) / g.d0);
    _lbZoomAt(g.c, g.z0, g.tx0, g.ty0, g.sx, g.sy, nz, (a.x + b.x) / 2, (a.y + b.y) / 2);
    return;
  }
  if (g.mode === 'pan') {
    _lbTx = e.clientX - g.px; _lbTy = e.clientY - g.py;
    _lbApply();
    return;
  }

  const dx = e.clientX - g.sx, dy = e.clientY - g.sy;
  if (g.mode === 'wait' && Math.hypot(dx, dy) > 10) {
    if (Math.abs(dx) > Math.abs(dy) * 1.2) g.mode = 'swipe-x';
    else if (dy > 0 && g.onMedia) g.mode = 'swipe-down';
    else g.mode = 'none';
  }
  g.dx = dx; g.dy = dy;
  if (g.mode === 'swipe-x') {
    // Rubber band when there is nothing to move to.
    _lbSwipeSet(S.currentMedia.length < 2 ? dx / 4 : dx, 0, 1);
  } else if (g.mode === 'swipe-down') {
    const k = Math.max(0, dy) / innerHeight;
    _lbSwipeSet(0, Math.max(0, dy), 1 - k * 0.6);
    EL.lightbox.style.background = `rgba(2,6,23,${(0.94 * (1 - k)).toFixed(3)})`;
  }
});

function _lbPointerUp(e) {
  if (!_lbPts.delete(e.pointerId)) return;
  const g = _lbG;
  if (!g) return;
  const cancelled = e.type === 'pointercancel';

  if (g.mode === 'pinch') {
    if (_lbZ < 1.05) _lbReset();
    if (_lbPts.size === 1 && _lbZ > 1) {
      _lbPanStart([..._lbPts.values()][0]);
      _lbG.onMedia = true;   // t0 stays unset: lifting the last finger is not a tap
    }
    else if (_lbPts.size === 0) _lbG = null;
    return;
  }
  if (_lbPts.size) return;
  _lbG = null;
  if (cancelled) { if (g.mode !== 'pan') _lbSnapBack(); return; }

  const dt = Math.max(1, performance.now() - g.t0);
  if (g.mode === 'swipe-x') {
    const fast = Math.abs(g.dx) / dt > 0.45 && Math.abs(g.dx) > 30;
    if (Math.abs(g.dx) > Math.min(90, innerWidth * 0.22) || fast) _lbSwipeTo(g.dx < 0 ? 1 : -1);
    else _lbSnapBack();
  } else if (g.mode === 'swipe-down') {
    if (g.dy > innerHeight * 0.18 || g.dy / dt > 0.5 && g.dy > 40) { _lbSwipeEnd(); closeLightbox(); }
    else _lbSnapBack();
  } else if ((g.mode === 'wait' || g.mode === 'pan') &&
             Math.hypot(e.clientX - g.x0, e.clientY - g.y0) < 10 && dt < 300) {
    // A tap. Two taps on the image close together = zoom toggle.
    const now = performance.now(), last = _lbTap;
    _lbTap = { x: e.clientX, y: e.clientY, t: now };
    if (last && now - last.t < 320 && Math.hypot(e.clientX - last.x, e.clientY - last.y) < 30
        && _lbImageOn() && g.onMedia) {
      _lbTap = null;
      if (_lbZ > 1) _lbReset();
      else _lbZoomAt(_lbCentre(), 1, 0, 0, e.clientX, e.clientY, 2.5, e.clientX, e.clientY);
    }
  }
}
EL.lightbox.addEventListener('pointerup', _lbPointerUp);
EL.lightbox.addEventListener('pointercancel', _lbPointerUp);

// ─── Download ─────────────────────────────────────────
async function downloadEntry(path) {
  if (!path) return;
  const entry = S.files.get(path);
  if (!entry) return;
  try {
    const url = await entryToURL(entry);
    const a   = document.createElement('a');
    a.href     = url;
    a.download = canonicalExt(entry.name.split('/').pop());
    a.click();
  } catch (e) {
    alert(`Download failed: ${e.message}`);
  }
}

// ─── Loading overlay ──────────────────────────────────
// Drives #loader while a folder or archive is opened. Loading code reports
// steps and progress; Loader.check() throws an AbortError once the user has
// pressed Cancel, so long loops can stop at their next yield point.
const fmtNum   = n => n.toLocaleString('en-US');
const fmtBytes = n => n >= 1e9 ? (n / 1e9).toFixed(2) + ' GB'
                    : n >= 1e6 ? (n / 1e6).toFixed(1) + ' MB'
                    : Math.max(1, Math.round(n / 1e3)) + ' KB';

const LOADER_STEPS = {
  scan:   'Scan folders',
  detect: 'Detect game',
  load:   'Index files',
  current:'Thumbnails on screen',
  read:   'Read archive',
  table:  'Decrypt file table',
  index:  'Index media',
  connect:'Connect to the game',
};

const LOADER_KINDS = {
  folder:  ['Opening game folder', '#i-folder'],
  archive: ['Opening archive', '#i-archive'],
  files:   ['Opening files', '#i-file'],
  remote:  ['Opening game link', '#i-link'],
};

const Loader = (() => {
  const root    = $('loader');
  const titleEl = $('loader-title');
  const nameEl  = $('loader-name');
  const pctEl   = $('loader-pct');
  const iconUse = $('loader-icon-use');
  const bar     = $('loader-bar');
  const fill    = $('loader-fill');
  const stepsEl = $('loader-steps');
  const errEl   = $('loader-error');
  const live    = $('loader-live');
  const cancel  = $('loader-cancel');
  const MARK = '<span class="ls-mark" aria-hidden="true">'
    + '<svg class="ls-check" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>'
    + '<svg class="ls-x" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></span>';

  // view: true when the loader only shows a background job's status; its
  // button then hides the overlay instead of cancelling anything.
  let active = false, cancelled = false, prevFocus = null, view = false, owner = null;
  const rows = new Map(); // step id → <li>

  function setSteps(ids) {
    const old = new Map(rows);
    rows.clear();
    stepsEl.innerHTML = '';
    for (const id of ids) {
      let li = old.get(id);
      if (!li) {
        li = document.createElement('li');
        li.className = 'loader-step';
        li.innerHTML = MARK + `<span class="ls-label">${LOADER_STEPS[id]}</span><span class="ls-detail"></span>`;
      }
      rows.set(id, li);
      stepsEl.appendChild(li);
    }
  }

  function progress(done, total) {
    if (!total) {
      bar.classList.add('indeterminate');
      bar.removeAttribute('aria-valuenow');
      pctEl.textContent = '';
      return;
    }
    const pct = Math.min(100, Math.floor(done / total * 100));
    bar.classList.remove('indeterminate');
    bar.setAttribute('aria-valuenow', pct);
    fill.style.width = pct + '%';
    pctEl.textContent = pct + '%';
  }

  function detail(id, text) {
    const li = rows.get(id);
    if (li) li.lastElementChild.textContent = text || '';
  }

  // state: '' (waiting) | 'active' | 'done' | 'error'. Re-sending the same
  // state only updates the detail, so live status views don't re-announce.
  function step(id, state, text) {
    const li = rows.get(id);
    if (!li) return;
    const cls = ('loader-step ' + state).trim();
    const changed = li.className !== cls;
    li.className = cls;
    if (state === 'active') li.setAttribute('aria-current', 'step');
    else li.removeAttribute('aria-current');
    if (text !== undefined) detail(id, text);
    if (state === 'active' && changed) { progress(0, 0); live.textContent = LOADER_STEPS[id] + '…'; }
  }

  function title(text) { titleEl.textContent = text; }

  // A background job finished while its status view is open.
  function finish() {
    progress(1, 1);
    cancel.textContent = 'Close';
  }

  function open({ kind, name, steps, view: isView = false }) {
    active = true; cancelled = false; view = isView; owner = null;
    prevFocus = document.activeElement;
    root.classList.remove('failed');
    const look = LOADER_KINDS[kind] || LOADER_KINDS.folder;
    titleEl.textContent = look[0];
    iconUse.setAttribute('href', look[1]);
    nameEl.textContent = name || '';
    errEl.textContent = '';
    fill.style.width = '0';
    rows.clear();          // fresh rows: nothing carries over from the last load
    setSteps(steps);
    progress(0, 0);
    cancel.textContent = view ? 'Hide' : 'Cancel';
    cancel.disabled = false;
    if (!view) document.body.setAttribute('aria-busy', 'true');
    root.classList.add('active');
    cancel.focus({ preventScroll: true });
  }

  function close() {
    if (!active) return;
    active = false; view = false; owner = null;
    root.classList.remove('active', 'failed');
    document.body.removeAttribute('aria-busy');
    live.textContent = '';
    if (prevFocus && document.contains(prevFocus)) prevFocus.focus({ preventScroll: true });
  }

  function fail(message) {
    for (const li of rows.values()) {
      if (li.classList.contains('active')) li.className = 'loader-step error';
    }
    root.classList.add('failed');
    titleEl.textContent = 'Could not open this game';
    errEl.textContent = message;
    progress(1, 1);
    pctEl.textContent = '';
    cancel.textContent = 'Close';
    cancel.disabled = false;
    document.body.removeAttribute('aria-busy');
    cancel.focus({ preventScroll: true });
  }

  function requestCancel() {
    if (!active) return;
    if (view || root.classList.contains('failed')) { close(); return; }
    cancelled = true;
    cancel.disabled = true;
    cancel.textContent = 'Cancelling…';
  }

  function check() {
    if (cancelled) throw new DOMException('Loading cancelled', 'AbortError');
  }

  cancel.addEventListener('click', requestCancel);
  root.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.stopPropagation(); requestCancel(); }
    if (e.key === 'Tab') { e.preventDefault(); cancel.focus(); } // only one control: keep focus inside
  });

  return {
    open, close, fail, step, detail, progress, setSteps, check, title, finish,
    get active() { return active; },
    get view()   { return view; },
    // The background scan whose status the loader is showing, if any.
    get owner()  { return owner; },
    set owner(s) { owner = s; },
  };
})();

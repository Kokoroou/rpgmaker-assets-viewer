// ─── DOM helpers ──────────────────────────────────────
const $ = id => document.getElementById(id);

const EL = {
  openBtn:          $('open-btn'),
  themeToggle:      $('theme-toggle'),
  folderInput:      $('folder-input'),
  rgssadInput:      $('rgssad-input'),
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
  dlFolderBtn:      $('dl-folder-btn'),
  lightbox:         $('lightbox'),
  lbImg:            $('lb-img'),
  lbAudio:          $('lb-audio'),
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
    url  = URL.createObjectURL(new Blob([data], { type: getMimeType(entry.name) }));
  } else if (ENC_IMAGE_EXT.test(entry.name) || ENC_AUDIO_EXT.test(entry.name)) {
    if (!S.key) throw new Error('No encryption key set');
    data = decryptMVMZ(await (await entryFile(entry)).arrayBuffer(), S.key);
    url  = URL.createObjectURL(new Blob([data], { type: getMimeType(entry.name) }));
  } else {
    url = URL.createObjectURL(await entryFile(entry));
  }
  S.blobCache.set(entry.path, url);
  return url;
}

function clearBlobCache() {
  S.blobCache.forEach(u => URL.revokeObjectURL(u));
  S.blobCache.clear();
  _preloadPool.clear();
}

// ─── Key ──────────────────────────────────────────────
function applyKey(key) {
  S.key = key;
  clearBlobCache();
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
      el.title = `Loading ${fmtNum(p.ready)} / ${fmtNum(p.total)} files`;
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
  return sPath + '|' + keys.map(k => `${k}:${(S.folders.get(k) || []).length}:${_sbHasKids(k) ? 1 : 0}`).join(',');
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
    hdr.innerHTML = `<button id="sb-back"><svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M7 2L3.5 5.5 7 9" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>${backLabel}</button>`;
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
    cur.innerHTML = `<span class="f-icon">${ICONS.folderOpen}</span><span class="f-name">${lbl}</span>${cnt ? `<span class="f-count">${cnt}</span>` : ''}`;
    cur.addEventListener('click', () => showFolder(sPath));
    if (S.currentFolder === sPath) cur.classList.add('active');
    EL.sidebar.appendChild(cur);

    if (children.length) {
      const div = document.createElement('div');
      div.className = 'sb-divider';
      EL.sidebar.appendChild(div);
    }
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
      <span class="f-name">${lbl}</span>
      ${cnt ? `<span class="f-count">${cnt}</span>` : ''}
      ${hasKids ? `<svg class="f-drill" width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M3.5 2l3 3-3 3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>` : ''}`;
    item.addEventListener('click', () => {
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
  const all      = S.folders.get(key) || [];
  const q        = S.query.toLowerCase();
  const filtered = q ? all.filter(p => p.toLowerCase().includes(q)) : all;
  S.currentMedia = filtered;

  const label = key === '__root__' ? 'root' : key;
  EL.folderPath.innerHTML = `<strong>${label}</strong> &ensp;·&ensp; ${filtered.length} items`;
  EL.grid.innerHTML = '';

  if (filtered.length === 0) {
    if (q) {
      showEmptyState('search', 'No items found', 'Try a different keyword');
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
}

function makeCard(entry, idx) {
  const card     = document.createElement('div');
  const baseName = entry.name.split('/').pop();
  const dispName = canonicalExt(baseName);

  if (entry.isAudio) {
    card.className = 'card audio-card';
    card.innerHTML = `
      <div class="card-img audio-thumb"><div class="audio-icon">${ICONS.music}</div></div>
      <div class="card-name" title="${dispName}">${dispName}</div>`;
  } else {
    card.className = 'card loading';
    card.innerHTML = `
      <div class="card-img"></div>
      <div class="card-name" title="${dispName}">${dispName}</div>`;
    const wrap = card.querySelector('.card-img');
    card._load = async () => {
      try {
        const url = await entryToURL(entry);
        const img = document.createElement('img');
        img.src = url;
        img.alt = dispName;
        img.addEventListener('load',  () => card.classList.remove('loading', 'error'));
        img.addEventListener('error', () => { card.classList.remove('loading'); card.classList.add('error'); });
        wrap.appendChild(img);
      } catch { card.classList.remove('loading'); card.classList.add('error'); }
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
async function openLightbox(idx) {
  _lbReset();
  S.lbIdx = idx;
  EL.lightbox.classList.add('open');
  await loadLbEntry(idx);
}

function closeLightbox() {
  EL.lbAudio.pause();
  EL.lightbox.classList.remove('open');
  _lbReset();
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
  const gen = ++_lbGeneration;
  const path  = S.currentMedia[idx];
  if (!path) return;
  const entry = S.files.get(path);
  if (!entry) return;

  const dispName = canonicalExt(entry.name.split('/').pop());
  EL.lbName.textContent    = dispName;
  EL.lbMeta.textContent    = '';
  EL.lbCounter.textContent = `${idx + 1} / ${S.currentMedia.length}`;
  EL.lbDownload.dataset.path = path;

  if (entry.isAudio) {
    EL.lbImg.style.display   = 'none';
    EL.lbAudio.style.display = 'block';
    EL.lbAudio.src = '';
    try {
      EL.lbAudio.src = await entryToURL(entry);
      EL.lbAudio.play().catch(() => {});
      EL.lbAudio.addEventListener('loadedmetadata', () => {
        const d = EL.lbAudio.duration;
        if (!isFinite(d)) return;
        const m = Math.floor(d / 60);
        const s = Math.floor(d % 60);
        EL.lbMeta.textContent = `${m}:${s.toString().padStart(2, '0')}`;
      }, { once: true });
    } catch (e) {
      EL.lbMeta.textContent = `⚠ ${e.message}`;
    }
  } else {
    EL.lbAudio.pause();
    EL.lbAudio.style.display = 'none';
    EL.lbImg.style.display   = 'block';
    EL.lbImg.style.opacity   = '0';
    try {
      const url = await entryToURL(entry);
      if (gen !== _lbGeneration) return;
      EL.lbImg.src = url;
      await EL.lbImg.decode();
      if (gen !== _lbGeneration) return;
      EL.lbImg.style.opacity = '1';
      EL.lbMeta.textContent  = `${EL.lbImg.naturalWidth} × ${EL.lbImg.naturalHeight} px`;
    } catch (e) {
      if (gen !== _lbGeneration) return;
      EL.lbImg.style.opacity = '1';
      EL.lbMeta.textContent  = `⚠ ${e.message}`;
    }
  }

  preloadAround(idx);
}

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
  if (Math.hypot(e.clientX - _lbMdx, e.clientY - _lbMdy) > 3) return;
  if (_lbZ > 1) { _lbZ = 1; _lbTx = 0; _lbTy = 0; } else { _lbZ = 2; }
  _lbApply();
});

EL.lightbox.addEventListener('mousedown', e => {
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
  load:   'Load files',
  current:'Current folder',
  read:   'Read archive',
  table:  'Decrypt file table',
  index:  'Index media',
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
    titleEl.textContent = kind === 'archive' ? 'Opening archive' : 'Opening game folder';
    iconUse.setAttribute('href', kind === 'archive' ? '#i-archive' : '#i-folder');
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

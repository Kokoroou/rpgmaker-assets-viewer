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

// ─── Lightbox zoom state ──────────────────────────────
let _lbZ = 1, _lbTx = 0, _lbTy = 0;
let _lbPanning = false, _lbPx = 0, _lbPy = 0;
let _lbMdx = 0, _lbMdy = 0;

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
async function entryToURL(entry) {
  if (S.blobCache.has(entry.path)) return S.blobCache.get(entry.path);
  let data, url;
  if (entry._getData) {
    data = await entry._getData();
    url  = URL.createObjectURL(new Blob([data], { type: getMimeType(entry.name) }));
  } else if (ENC_IMAGE_EXT.test(entry.name) || ENC_AUDIO_EXT.test(entry.name)) {
    if (!S.key) throw new Error('No encryption key set');
    data = decryptMVMZ(await entry._file.arrayBuffer(), S.key);
    url  = URL.createObjectURL(new Blob([data], { type: getMimeType(entry.name) }));
  } else {
    url = URL.createObjectURL(entry._file);
  }
  S.blobCache.set(entry.path, url);
  return url;
}

function clearBlobCache() {
  S.blobCache.forEach(u => URL.revokeObjectURL(u));
  S.blobCache.clear();
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

function renderSidebar() {
  const sPath    = S.sidebarPath;
  const children = _sbChildren(sPath);
  const parent   = _sbParent(sPath);

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
    cur.innerHTML = `<span class="f-icon">📂</span><span class="f-name">${lbl}</span>${cnt ? `<span class="f-count">${cnt}</span>` : ''}`;
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
      <span class="f-icon">📁</span>
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
}

function setActiveFolder(key) {
  EL.sidebar.querySelectorAll('.folder-item').forEach(el =>
    el.classList.toggle('active', el.dataset.folder === key));
}

// ─── Grid ─────────────────────────────────────────────
function showEmptyState(icon, msg, sub) {
  EL.emptySearch.style.display = 'flex';
  EL.emptyIcon.textContent = icon;
  EL.emptyMsg.textContent  = msg;
  EL.emptySub.textContent  = sub;
}

function showFolder(key) {
  S.currentFolder = key;
  setActiveFolder(key);
  const all      = S.folders.get(key) || [];
  const q        = S.query.toLowerCase();
  const filtered = q ? all.filter(p => p.toLowerCase().includes(q)) : all;
  S.currentMedia = filtered;

  const label = key === '__root__' ? 'root' : key;
  EL.folderPath.innerHTML = `<strong>${label}</strong> &ensp;·&ensp; ${filtered.length} items`;
  EL.grid.innerHTML = '';

  if (filtered.length === 0) {
    if (q) {
      showEmptyState('⌕', 'No items found', 'Try a different keyword');
    } else {
      showEmptyState('📂', 'No media files in this folder', 'Only images and audio are shown');
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
      <div class="card-img audio-thumb"><div class="audio-icon">♪</div></div>
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

  card.addEventListener('click', () => openLightbox(idx));
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

async function loadLbEntry(idx) {
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
    EL.lbImg.style.opacity   = '.3';
    try {
      const url = await entryToURL(entry);
      EL.lbImg.src = url;
      EL.lbImg.onload = () => {
        EL.lbImg.style.opacity = '1';
        EL.lbMeta.textContent  = `${EL.lbImg.naturalWidth} × ${EL.lbImg.naturalHeight} px`;
      };
    } catch (e) {
      EL.lbImg.style.opacity = '1';
      EL.lbMeta.textContent  = `⚠ ${e.message}`;
    }
  }
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

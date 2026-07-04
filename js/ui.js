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

// ─── Sidebar tree ─────────────────────────────────────
const expandedNodes = new Set();

function buildFolderTree() {
  const root = { children: new Map() };
  const sorted = [...S.folders.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const rootIdx = sorted.findIndex(([k]) => k === '__root__');
  if (rootIdx > 0) { const [e] = sorted.splice(rootIdx, 1); sorted.unshift(e); }

  for (const [folderKey, paths] of sorted) {
    if (folderKey === '__root__') {
      root.children.set('__root__', {
        label: '(root)', key: '__root__', count: paths.length,
        children: new Map(), vpath: '__root__'
      });
      continue;
    }
    const parts = folderKey.split('/');
    let node = root;
    for (let d = 0; d < parts.length; d++) {
      const part = parts[d];
      const vpath = parts.slice(0, d + 1).join('/');
      if (!node.children.has(part)) {
        node.children.set(part, { label: part, key: null, count: 0, children: new Map(), vpath });
      }
      if (d === parts.length - 1) {
        const leaf = node.children.get(part);
        leaf.key = folderKey;
        leaf.count = paths.length;
      }
      node = node.children.get(part);
    }
  }
  return root;
}

function renderTreeNode(parentEl, childMap, depth) {
  for (const [, node] of childMap) {
    const hasChildren = node.children.size > 0;
    const isExpanded  = expandedNodes.has(node.vpath);

    const item = document.createElement('div');
    item.className = 'folder-item';
    item.style.paddingLeft = (12 + depth * 16) + 'px';
    if (node.key) { item.dataset.folder = node.key; item.title = node.key; }

    item.innerHTML = `
      ${hasChildren
        ? `<button class="tree-toggle${isExpanded ? ' expanded' : ''}" aria-label="Toggle">▶</button>`
        : `<span class="tree-spacer"></span>`}
      <span class="f-icon">📁</span>
      <span class="f-name">${node.label}</span>
      ${node.count ? `<span class="f-count">${node.count}</span>` : ''}`;
    parentEl.appendChild(item);

    if (hasChildren) {
      const childrenEl = document.createElement('div');
      childrenEl.className = 'tree-children' + (isExpanded ? ' open' : '');
      renderTreeNode(childrenEl, node.children, depth + 1);
      parentEl.appendChild(childrenEl);

      item.addEventListener('click', e => {
        const onToggle = e.target.closest('.tree-toggle');
        if (onToggle || !node.key) {
          const nowOpen = childrenEl.classList.toggle('open');
          item.querySelector('.tree-toggle').classList.toggle('expanded', nowOpen);
          if (nowOpen) expandedNodes.add(node.vpath);
          else expandedNodes.delete(node.vpath);
          return;
        }
        if (node.key) showFolder(node.key);
      });
    } else if (node.key) {
      item.addEventListener('click', () => showFolder(node.key));
    }
  }
}

function renderSidebar() {
  expandedNodes.clear();
  const tree = buildFolderTree();

  EL.sidebar.innerHTML = '<div id="sidebar-header">Folders</div>';
  renderTreeNode(EL.sidebar, tree.children, 0);
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

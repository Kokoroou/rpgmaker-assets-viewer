// ─── Restore persisted sidebar width ──────────────────
const _sw = localStorage.getItem('sidebarWidth');
if (_sw) {
  const maxW = window.innerWidth <= 600 ? 120 : Infinity;
  document.documentElement.style.setProperty('--sw', Math.min(parseInt(_sw), maxW) + 'px');
}

// ─── Status helper ────────────────────────────────────
function setStatus(el, cls, text) {
  if (!el) return;
  el.className = cls;
  if (cls === 'loading') {
    el.innerHTML = '<span class="status-spinner"></span>' + text;
  } else {
    el.textContent = text;
  }
}

// ─── MV/MZ folder loading ─────────────────────────────
async function loadMVMZFolder(files) {
  clearBlobCache();
  S.files.clear();
  S.folders.clear();
  S.sidebarPath = null;

  const st = EL.setupStatus;
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    if (!MEDIA_EXT.test(f.name)) continue;
    const rel    = f._dragPath || f.webkitRelativePath;
    const parts  = rel.split('/');
    const folder = parts.length >= 3 ? parts.slice(1, -1).join('/') : '__root__';
    const isAudio = AUDIO_EXT.test(f.name);
    S.files.set(rel, { name: f.name, path: rel, isAudio, isImage: !isAudio, _file: f });
    if (!S.folders.has(folder)) S.folders.set(folder, []);
    S.folders.get(folder).push(rel);
    if (i % 10000 === 9999) {
      setStatus(st, 'loading', `Indexing… ${S.files.size} media files`);
      await new Promise(r => setTimeout(r, 0));
    }
  }

  showGrid();
}

// ─── RGSSAD archive loading ───────────────────────────
async function loadRGSSAD(file) {
  const st = EL.setupStatus;
  setStatus(st, 'loading', 'Reading archive…');
  try {
    const buf    = await file.arrayBuffer();
    setStatus(st, 'loading', 'Indexing files…');
    const parsed = parseRGSSAD(buf);

    clearBlobCache();
    S.files.clear();
    S.folders.clear();
    S.sidebarPath = null;

    for (const item of parsed) {
      if (!MEDIA_EXT.test(item.name)) continue;
      const parts   = item.name.split('/');
      const folder  = parts.length > 1 ? parts.slice(0, -1).join('/') : '__root__';
      const isAudio = AUDIO_EXT.test(item.name);
      const { offset, size, fKey } = item;
      S.files.set(item.name, {
        name: item.name, path: item.name,
        isAudio, isImage: !isAudio,
        _getData: async () => {
          const ab = await file.slice(offset, offset + size).arrayBuffer();
          return rgssDecryptData(new Uint8Array(ab), fKey);
        },
      });
      if (!S.folders.has(folder)) S.folders.set(folder, []);
      S.folders.get(folder).push(item.name);
    }

    setStatus(st, 'ok', `✓ Loaded ${S.files.size} items from "${file.name}"`);
    showGrid();
  } catch (e) {
    setStatus(st, 'err', `✕ ${e.message}`);
  }
}

// ─── Auto-detect game folder ──────────────────────────
async function loadGameFolder(allFiles) {
  const st = EL.setupStatus;
  setStatus(st, 'loading', 'Analyzing folder…');
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

  const rgssadFile = allFiles.find(f => /\.(rgssad|rgss2a|rgss3a)$/i.test(f.name));
  if (rgssadFile) {
    await loadRGSSAD(rgssadFile);
    return;
  }

  const sysJson = allFiles.find(f =>
    f.name === 'System.json' &&
    (f._dragPath || f.webkitRelativePath || '').toLowerCase().includes('/data/')
  );
  if (sysJson) {
    try {
      const json = JSON.parse(await sysJson.text());
      if (json.encryptionKey) applyKey(json.encryptionKey);
    } catch {}
  }

  await loadMVMZFolder(allFiles);
}

// ─── Grid activation ──────────────────────────────────
function showGrid() {
  EL.countBadge.textContent = S.files.size ? `${S.files.size} items` : '';
  renderSidebar();
  const sidebarHidden = localStorage.getItem('sidebarHidden') === '1';
  EL.sidebar.classList.toggle('hidden', sidebarHidden);
  $('sidebar-resizer').classList.toggle('hidden', sidebarHidden);
  $('sidebar-toggle').setAttribute('aria-pressed', sidebarHidden ? 'false' : 'true');
  EL.setup.style.display    = 'none';
  EL.toolbar.classList.add('show');
  EL.gridWrap.style.display = 'block';
  const first = S.folders.keys().next().value;
  if (first) {
    showFolder(first);
  } else {
    EL.folderPath.innerHTML = '';
    EL.grid.innerHTML       = '';
    S.currentFolder = null;
    S.currentMedia  = [];
    if (EL.dlFolderBtn) EL.dlFolderBtn.disabled = true;
    showEmptyState('📂', 'No supported media files found',
      'Make sure you selected a valid RPG Maker game folder');
  }
}

// ─── Events: Theme toggle ─────────────────────────────
EL.themeToggle.addEventListener('click', () => {
  const html = document.documentElement;
  const goLight = html.dataset.theme !== 'light';
  if (goLight) html.dataset.theme = 'light';
  else delete html.dataset.theme;
  localStorage.setItem('theme', goLight ? 'light' : 'dark');
});

// ─── Events: Folder picker ────────────────────────────
EL.openBtn.addEventListener('click', () => EL.folderInput.click());
$('open-game-btn').addEventListener('click', () => EL.folderInput.click());
EL.folderInput.addEventListener('change', async () => {
  const files = Array.from(EL.folderInput.files);
  if (files.length) {
    const orig = EL.openBtn.innerHTML;
    EL.openBtn.disabled = true;
    EL.openBtn.innerHTML = '<span class="status-spinner"></span>Loading…';
    EL.grid.innerHTML = '';
    EL.folderPath.innerHTML = '';
    EL.countBadge.textContent = '';
    EL.searchBox.value = '';
    S.query = '';
    await loadGameFolder(files);
    EL.openBtn.disabled = false;
    EL.openBtn.innerHTML = orig;
  }
  EL.folderInput.value = '';
});

// ─── Events: RGSSAD archive ───────────────────────────
$('load-rgssad-btn').addEventListener('click', () => EL.rgssadInput.click());
EL.rgssadInput.addEventListener('change', async () => {
  const f = EL.rgssadInput.files[0];
  if (!f) return;
  EL.rgssadInput.value = '';
  EL.grid.innerHTML = '';
  EL.folderPath.innerHTML = '';
  EL.countBadge.textContent = '';
  EL.searchBox.value = '';
  S.query = '';
  await loadRGSSAD(f);
});

// ─── Events: Lightbox ─────────────────────────────────
EL.lbClose.addEventListener('click', closeLightbox);
EL.lbPrev.addEventListener('click', () => lbMove(-1));
EL.lbNext.addEventListener('click', () => lbMove(+1));
EL.lightbox.addEventListener('click', e => { if (e.target === EL.lightbox && _lbZ <= 1) closeLightbox(); });
EL.lbDownload.addEventListener('click', () => downloadEntry(EL.lbDownload.dataset.path));

// ─── Events: Search & size slider ─────────────────────
let searchTimer;
EL.searchBox.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    S.query = EL.searchBox.value.trim();
    if (S.currentFolder) showFolder(S.currentFolder);
  }, 240);
});

EL.sizeSlider.addEventListener('input', () =>
  EL.grid.style.setProperty('--ts', EL.sizeSlider.value + 'px'));

// ─── Events: Mobile search overlay ────────────────────
const _searchOverlay = $('search-overlay');
const _overlayInput  = $('overlay-search-input');

$('mobile-search-btn').addEventListener('click', () => {
  _overlayInput.value = EL.searchBox.value;
  _searchOverlay.classList.add('open');
  setTimeout(() => _overlayInput.focus(), 50);
});

function closeMobileSearch() { _searchOverlay.classList.remove('open'); }

$('search-overlay-close').addEventListener('click', closeMobileSearch);
_searchOverlay.addEventListener('click', e => { if (e.target === _searchOverlay) closeMobileSearch(); });
_overlayInput.addEventListener('input', () => {
  EL.searchBox.value = _overlayInput.value;
  EL.searchBox.dispatchEvent(new Event('input'));
});

// ─── Events: Keyboard ─────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (_searchOverlay.classList.contains('open'))   { closeMobileSearch(); return; }
    if ($('about-modal').classList.contains('open')) { $('about-modal').classList.remove('open'); return; }
    if (EL.lightbox.classList.contains('open'))      closeLightbox();
  }
  if (EL.lightbox.classList.contains('open')) {
    if (e.key === 'ArrowLeft'  || e.key === 'a') lbMove(-1);
    if (e.key === 'ArrowRight' || e.key === 'd') lbMove(+1);
  }
});

// ─── Events: About modal ───────────────────────────────
$('about-btn').addEventListener('click',   () => $('about-modal').classList.add('open'));
$('about-close').addEventListener('click', () => $('about-modal').classList.remove('open'));
$('about-modal').addEventListener('click', e => { if (e.target === $('about-modal')) $('about-modal').classList.remove('open'); });

// ─── Events: Download folder ──────────────────────────
$('dl-folder-btn').addEventListener('click', downloadFolder);

// ─── Events: Sidebar toggle ───────────────────────────
$('sidebar-toggle').addEventListener('click', () => {
  const hidden = EL.sidebar.classList.toggle('hidden');
  $('sidebar-resizer').classList.toggle('hidden', hidden);
  $('sidebar-toggle').setAttribute('aria-pressed', hidden ? 'false' : 'true');
  localStorage.setItem('sidebarHidden', hidden ? '1' : '0');
});

// ─── Events: Sidebar resize ───────────────────────────
let _resizing = false;
$('sidebar-resizer').addEventListener('mousedown', () => {
  _resizing = true;
  $('sidebar-resizer').classList.add('dragging');
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';
});
document.addEventListener('mousemove', e => {
  if (!_resizing) return;
  const w = Math.max(120, Math.min(400, e.clientX - $('layout').getBoundingClientRect().left));
  document.documentElement.style.setProperty('--sw', w + 'px');
  localStorage.setItem('sidebarWidth', w);
});
document.addEventListener('mouseup', () => {
  if (!_resizing) return;
  _resizing = false;
  $('sidebar-resizer').classList.remove('dragging');
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
});

// ─── Drag & drop ──────────────────────────────────────

// Modern path: File System Access API (getAsFileSystemHandle)
async function traverseHandle(handle, pathPrefix, files, onProgress) {
  const entryPath = pathPrefix ? pathPrefix + '/' + handle.name : handle.name;
  if (handle.kind === 'file') {
    const file = await handle.getFile();
    file._dragPath = entryPath;
    files.push(file);
    if (files.length % 500 === 0) onProgress?.(files.length);
  } else if (handle.kind === 'directory') {
    for await (const [, child] of handle.entries()) {
      await traverseHandle(child, entryPath, files, onProgress);
    }
  }
}

// Legacy path: FileSystem Entry API (webkitGetAsEntry)
async function traverseEntry(entry, pathPrefix, files, onProgress) {
  const entryPath = pathPrefix ? pathPrefix + '/' + entry.name : entry.name;
  if (entry.isFile) {
    const file = await new Promise((res, rej) => entry.file(res, rej));
    file._dragPath = entryPath;
    files.push(file);
    if (files.length % 500 === 0) onProgress?.(files.length);
  } else if (entry.isDirectory) {
    const reader = entry.createReader();
    let batch;
    do {
      batch = await new Promise((res, rej) => reader.readEntries(res, rej));
      for (const e of batch) await traverseEntry(e, entryPath, files, onProgress);
    } while (batch.length > 0);
  }
}

async function handleDrop(dataTransfer) {
  const overlay = $('drag-overlay');
  const msg     = $('drag-msg');

  // Collect entries synchronously before any await
  const pairs = [];
  for (const item of dataTransfer.items) {
    if (item.kind !== 'file') continue;
    pairs.push({ item, entry: item.webkitGetAsEntry?.() });
  }

  const resetMsg = () => { msg.textContent = 'Drop game folder or archive here'; };
  const prepareReload = () => {
    EL.grid.innerHTML = ''; EL.folderPath.innerHTML = '';
    EL.countBadge.textContent = ''; EL.searchBox.value = ''; S.query = '';
  };

  // Handle RGSSAD archive drop
  for (const { entry } of pairs) {
    if (!entry?.isFile) continue;
    if (!/\.(rgssad|rgss2a|rgss3a)$/i.test(entry.name)) continue;
    overlay.classList.add('active');
    msg.textContent = `Loading ${entry.name}…`;
    try {
      const file = await new Promise((res, rej) => entry.file(res, rej));
      prepareReload();
      await loadRGSSAD(file);
    } finally {
      overlay.classList.remove('active');
      resetMsg();
    }
    return;
  }

  // Handle folder drop
  const dirPair = pairs.find(p => p.entry?.isDirectory);
  if (!dirPair) return;

  overlay.classList.add('active');
  msg.textContent = 'Reading folder…';
  try {
    const files = [];
    const progress = count => { msg.textContent = `Reading folder… ${count} files`; };

    // Modern File System Access API — respects file permissions correctly
    if (typeof dirPair.item.getAsFileSystemHandle === 'function') {
      try {
        const handle = await dirPair.item.getAsFileSystemHandle();
        if (handle?.kind === 'directory') {
          await traverseHandle(handle, '', files, progress);
        }
      } catch (_) { /* fall through to legacy */ }
    }

    // Legacy FileSystem Entry API fallback
    if (files.length === 0 && dirPair.entry) {
      await traverseEntry(dirPair.entry, '', files, progress);
    }

    msg.textContent = `Indexing ${files.length} files…`;
    prepareReload();
    await loadGameFolder(files);
  } finally {
    overlay.classList.remove('active');
    resetMsg();
  }
}

let _dragDepth = 0;
document.addEventListener('dragenter', e => {
  if (!e.dataTransfer.types.includes('Files')) return;
  if (++_dragDepth === 1) $('drag-overlay').classList.add('active');
});
document.addEventListener('dragleave', () => {
  if (--_dragDepth <= 0) { _dragDepth = 0; $('drag-overlay').classList.remove('active'); }
});
document.addEventListener('dragover', e => e.preventDefault());
document.addEventListener('drop', async e => {
  e.preventDefault();
  _dragDepth = 0;
  $('drag-overlay').classList.remove('active');
  if (e.dataTransfer.types.includes('Files')) await handleDrop(e.dataTransfer);
});

// ─── ZIP writer ────────────────────────────────────────
const _CRC32 = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = _CRC32[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function buildZip(items) {
  const enc = new TextEncoder();
  const localChunks = [], cdChunks = [], metas = [];
  let offset = 0;

  for (const { name, data } of items) {
    const nb  = enc.encode(name);
    const crc = crc32(data);
    const lh  = new ArrayBuffer(30 + nb.length);
    const lv  = new DataView(lh);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, nb.length, true);
    new Uint8Array(lh, 30).set(nb);
    metas.push({ nb, crc, size: data.length, offset });
    localChunks.push(lh, data);
    offset += 30 + nb.length + data.length;
  }

  const cdStart = offset;
  for (const m of metas) {
    const cd = new ArrayBuffer(46 + m.nb.length);
    const cv = new DataView(cd);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint32(16, m.crc, true);
    cv.setUint32(20, m.size, true);
    cv.setUint32(24, m.size, true);
    cv.setUint16(28, m.nb.length, true);
    cv.setUint32(42, m.offset, true);
    new Uint8Array(cd, 46).set(m.nb);
    cdChunks.push(cd);
    offset += 46 + m.nb.length;
  }

  const eocd = new ArrayBuffer(22);
  const ev   = new DataView(eocd);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8,  metas.length, true);
  ev.setUint16(10, metas.length, true);
  ev.setUint32(12, offset - cdStart, true);
  ev.setUint32(16, cdStart, true);

  return new Blob([...localChunks, ...cdChunks, eocd], { type: 'application/zip' });
}

// ─── Download folder as ZIP ───────────────────────────
async function downloadFolder() {
  const key = S.currentFolder;
  if (!key) return;
  const paths = S.folders.get(key) || [];
  if (!paths.length) return;

  const btn = $('dl-folder-btn');
  btn.disabled = true;

  try {
    const items = [];
    for (const path of paths) {
      const entry = S.files.get(path);
      if (!entry) continue;
      try {
        let data;
        if (entry._getData) {
          data = new Uint8Array(await entry._getData());
        } else if (ENC_IMAGE_EXT.test(entry.name) || ENC_AUDIO_EXT.test(entry.name)) {
          if (!S.key) throw new Error('No encryption key');
          data = new Uint8Array(decryptMVMZ(await entry._file.arrayBuffer(), S.key));
        } else {
          data = new Uint8Array(await entry._file.arrayBuffer());
        }
        items.push({ name: canonicalExt(entry.name.split('/').pop()), data });
      } catch {}
    }

    const zip = buildZip(items);
    const folderName = key === '__root__' ? 'assets' : key.split('/').pop();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(zip);
    a.download = `${folderName}.zip`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 30_000);
  } catch (e) {
    alert(`Download failed: ${e.message}`);
  } finally {
    btn.disabled = false;
  }
}


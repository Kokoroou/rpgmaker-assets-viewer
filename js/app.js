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
  el.textContent = text;
}

// Let the browser paint (and the Cancel button respond) between work chunks.
const nextFrame = () => new Promise(r => setTimeout(r, 0));

// Yields at most every ~30 ms of work, so long loops stay responsive without
// paying a setTimeout per item.
function makeYielder() {
  let last = performance.now();
  return async () => {
    if (performance.now() - last < 30) return false;
    await nextFrame();
    Loader.check();
    last = performance.now();
    return true;
  };
}

// ─── Commit a freshly indexed library ─────────────────
// Loading builds into new Maps and only swaps them in here, so a cancelled or
// failed load leaves whatever was open before untouched. A lazy folder scan
// keeps filling the same Maps after the swap, in the background.
function commitLibrary(files, folders, key, scan = null) {
  clearBlobCache();
  if (scan) adoptScan(scan); else dropScan();
  S.key = key || '';
  S.files   = files;
  S.folders = folders;
  S.folderStats = scan ? scan.stats : null;
  S.currentFolder = null;
  S.sidebarPath = null;
  EL.grid.innerHTML = '';
  EL.folderPath.innerHTML = '';
  EL.countBadge.textContent = '';
  EL.searchBox.value = '';
  S.query = '';
  setStatus(EL.setupStatus, '', '');
  showGrid();
}

function mediaSummary(files) {
  let img = 0, aud = 0;
  for (const e of files.values()) e.isAudio ? aud++ : img++;
  const parts = [];
  if (img) parts.push(`${fmtNum(img)} image${img === 1 ? '' : 's'}`);
  if (aud) parts.push(`${fmtNum(aud)} audio`);
  return parts.join(' · ') || 'No media found';
}

// ─── MV/MZ folder loading ─────────────────────────────
async function loadMVMZFolder(allFiles, key) {
  const files = new Map(), folders = new Map();
  const total = allFiles.length;
  const tick  = makeYielder();

  Loader.step('index', 'active', `0 / ${fmtNum(total)} files`);
  for (let i = 0; i < total; i++) {
    const f = allFiles[i];
    if (MEDIA_EXT.test(f.name)) {
      const rel    = f.webkitRelativePath;
      const parts  = rel.split('/');
      const folder = parts.length >= 3 ? parts.slice(1, -1).join('/') : '__root__';
      const isAudio = AUDIO_EXT.test(f.name);
      files.set(rel, { name: f.name, path: rel, isAudio, isImage: !isAudio, _file: f });
      if (!folders.has(folder)) folders.set(folder, []);
      folders.get(folder).push(rel);
    }
    if (await tick()) {
      Loader.progress(i + 1, total);
      Loader.detail('index', `${fmtNum(i + 1)} / ${fmtNum(total)} files`);
    }
  }
  Loader.progress(1, 1);
  Loader.step('index', 'done', mediaSummary(files));
  await nextFrame();
  Loader.check();

  commitLibrary(files, folders, key);
}

// ─── RGSSAD archive loading ───────────────────────────
const ARCHIVE_ENGINE = { rgssad: 'RPG Maker XP', rgss2a: 'RPG Maker VX', rgss3a: 'RPG Maker VX Ace' };
const archiveEngine = name => ARCHIVE_ENGINE[name.split('.').pop().toLowerCase()] || 'RGSSAD archive';

// file.arrayBuffer() gives no progress, so stream the file into one buffer.
async function readFileWithProgress(file, onProgress) {
  if (typeof file.stream !== 'function') return file.arrayBuffer();
  const out    = new Uint8Array(file.size);
  const reader = file.stream().getReader();
  const tick   = makeYielder();
  let off = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      out.set(value, off);
      off += value.length;
      Loader.check();
      onProgress(off, file.size);
      await tick();
    }
  } catch (e) {
    reader.cancel().catch(() => {});
    throw e;
  }
  return out.buffer;
}

async function loadRGSSAD(file) {
  Loader.step('read', 'active', `0 / ${fmtBytes(file.size)}`);
  const buf = await readFileWithProgress(file, (n, t) => {
    Loader.progress(n, t);
    Loader.detail('read', `${fmtBytes(n)} / ${fmtBytes(t)}`);
  });
  Loader.step('read', 'done', fmtBytes(file.size));

  Loader.step('table', 'active', archiveEngine(file.name));
  await nextFrame();
  Loader.check();
  const parsed = parseRGSSAD(buf);
  Loader.step('table', 'done', `${fmtNum(parsed.length)} entries`);

  const files = new Map(), folders = new Map();
  const tick  = makeYielder();
  Loader.step('index', 'active', `0 / ${fmtNum(parsed.length)}`);
  for (let i = 0; i < parsed.length; i++) {
    const item = parsed[i];
    if (MEDIA_EXT.test(item.name)) {
      const parts   = item.name.split('/');
      const folder  = parts.length > 1 ? parts.slice(0, -1).join('/') : '__root__';
      const isAudio = AUDIO_EXT.test(item.name);
      const { offset, size, fKey } = item;
      files.set(item.name, {
        name: item.name, path: item.name,
        isAudio, isImage: !isAudio,
        _getData: async () => {
          const ab = await file.slice(offset, offset + size).arrayBuffer();
          return rgssDecryptData(new Uint8Array(ab), fKey);
        },
      });
      if (!folders.has(folder)) folders.set(folder, []);
      folders.get(folder).push(item.name);
    }
    if (await tick()) {
      Loader.progress(i + 1, parsed.length);
      Loader.detail('index', `${fmtNum(i + 1)} / ${fmtNum(parsed.length)}`);
    }
  }
  Loader.progress(1, 1);
  Loader.step('index', 'done', mediaSummary(files));
  await nextFrame();
  Loader.check();

  commitLibrary(files, folders, '');
}

// ─── Auto-detect game folder ──────────────────────────
function detectFolderEngine(files) {
  let mz = false, mv = false;
  for (const f of files) {
    if (f.name === 'rmmz_core.js') mz = true;
    else if (f.name === 'rpg_core.js') mv = true;
  }
  return mz ? 'RPG Maker MZ' : mv ? 'RPG Maker MV' : null;
}

async function loadGameFolder(allFiles) {
  Loader.step('scan', 'done', `${fmtNum(allFiles.length)} files`);
  Loader.step('detect', 'active');
  await nextFrame();
  Loader.check();

  const rgssadFile = allFiles.find(f => /\.(rgssad|rgss2a|rgss3a)$/i.test(f.name));
  if (rgssadFile) {
    Loader.step('detect', 'done', `${archiveEngine(rgssadFile.name)} · ${rgssadFile.name}`);
    Loader.setSteps(['scan', 'detect', 'read', 'table', 'index']);
    await loadRGSSAD(rgssadFile);
    return;
  }

  const sysJson = allFiles.find(f =>
    f.name === 'System.json' &&
    (f.webkitRelativePath || '').toLowerCase().includes('/data/')
  );
  let key = '';
  if (sysJson) {
    try {
      const json = JSON.parse(await sysJson.text());
      if (json.encryptionKey) key = json.encryptionKey;
    } catch {}
  }
  Loader.check();

  const engine = detectFolderEngine(allFiles);
  Loader.step('detect', 'done',
    engine || sysJson ? `${engine || 'RPG Maker MV/MZ'} · ${key ? 'encrypted' : 'not encrypted'}`
                      : 'Unknown layout, scanning for media');

  await loadMVMZFolder(allFiles, key);
}

// ─── Load lifecycle ───────────────────────────────────
// Wraps one open-folder/archive action: busy UI, loader overlay, cancel and
// error handling. `task` opens the loader itself once it knows the name.
let _loading = false;
async function runLoad(task) {
  if (_loading || Loader.active) return;
  _loading = true;
  const orig = EL.openBtn.innerHTML;
  EL.openBtn.disabled = true;
  EL.openBtn.innerHTML = '<span class="status-spinner"></span><span class="btn-label">Loading…</span>';
  try {
    await task();
    Loader.close();
  } catch (e) {
    if (e?.name === 'AbortError') {
      Loader.close();
    } else {
      const msg = e?.message || String(e);
      if (Loader.active) Loader.fail(msg);
      setStatus(EL.setupStatus, 'err', `✕ ${msg}`);
    }
  } finally {
    _loading = false;
    EL.openBtn.disabled = false;
    EL.openBtn.innerHTML = orig;
  }
}

const FOLDER_STEPS  = ['scan', 'detect', 'index'];
const ARCHIVE_STEPS = ['read', 'table', 'index'];
const folderNameOf  = files => (files[0]?.webkitRelativePath || '').split('/')[0];

// Folder whose File list is already in hand (the <input webkitdirectory> path).
function openFileList(files) {
  return runLoad(async () => {
    Loader.open({ kind: 'folder', name: folderNameOf(files), steps: FOLDER_STEPS });
    await loadGameFolder(files);
  });
}

// Folder behind a directory handle or entry (directory picker, drag & drop).
// Only the root is read before the overlay closes: detection, the key and the
// first media folder. The rest is listed and loaded in the background
// (js/scan.js), with progress in the header chip.
// `sources` is a list of {fs, root} to try in order (handle API, then entries).
const LAZY_STEPS = ['detect', 'scan', 'load'];

function openFolderLazy(name, sources) {
  return runLoad(async () => {
    Loader.open({ kind: 'folder', name, steps: LAZY_STEPS });
    Loader.step('detect', 'active');

    let fs = null, root = null, items = null, lastErr = null;
    for (const src of sources) {
      try {
        const r = await src.root;
        if (!r) continue;
        items = await src.fs.list(r);
        fs = src.fs; root = r;
        break;
      } catch (e) { lastErr = e; }
    }
    Loader.check();
    if (!fs) throw lastErr || new Error('Could not read this folder.');
    if (!items.length) throw new Error('This folder is empty.');

    const arch = items.find(it => !fs.isDir(it) && ARCHIVE_RE.test(fs.name(it)));
    if (arch) {
      const file = await fs.file(arch);
      Loader.step('detect', 'done', `${archiveEngine(file.name)} · ${file.name}`);
      Loader.setSteps(['detect', 'read', 'table', 'index']);
      await loadRGSSAD(file);
      return;
    }

    const info = await detectLazy(fs, root, items);
    Loader.check();
    const scan = new FolderScan(fs, name);
    scan.key = info.key;
    scan.keyChecked = info.hasSystem;
    scan.detectLabel = info.engine || info.hasSystem
      ? `${info.engine || 'RPG Maker MV/MZ'} · ${info.key ? 'encrypted' : 'not encrypted'}`
      : 'Unknown layout, scanning for media';
    Loader.owner = scan;
    scan.onChange = onScanChange;
    scan.start(items);
    renderScanLoader(scan);

    // Wait for the first folder with media (or the end of the scan).
    try {
      while (!scan.hasFolder && !scan.listed) {
        await new Promise(r => setTimeout(r, 50));
        Loader.check();
      }
    } catch (e) { scan.abort(); throw e; }

    commitLibrary(scan.files, scan.folders, scan.key, scan);
  });
}

function openArchive(file) {
  return runLoad(async () => {
    Loader.open({ kind: 'archive', name: file.name, steps: ARCHIVE_STEPS });
    await loadRGSSAD(file);
  });
}

// ─── Grid activation ──────────────────────────────────
function showGrid() {
  EL.countBadge.textContent = S.files.size ? `${S.files.size} items` : '';
  renderSidebar();
  // Search is only useful once there is something to search
  document.body.classList.toggle('has-files', S.files.size > 0);
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
    showEmptyState('folderOpen', 'No supported media files found',
      'Make sure you selected a valid RPG Maker game folder');
  }
}

// ─── Events: Theme toggle ─────────────────────────────
// Default follows the OS (prefers-color-scheme). Clicking flips to the other
// theme; picking the one the OS already uses clears the override again, so the
// page goes back to following the system.
const _darkMQ = window.matchMedia('(prefers-color-scheme: dark)');
const _sysTheme = () => _darkMQ.matches ? 'dark' : 'light';
const _curTheme = () => document.documentElement.dataset.theme || _sysTheme();

function _syncThemeLabel() {
  const next = _curTheme() === 'dark' ? 'light' : 'dark';
  EL.themeToggle.title = `Switch to ${next} theme`;
  EL.themeToggle.setAttribute('aria-label', `Switch to ${next} theme`);
}

EL.themeToggle.addEventListener('click', () => {
  const html = document.documentElement;
  const next = _curTheme() === 'dark' ? 'light' : 'dark';
  try {
    if (next === _sysTheme()) { delete html.dataset.theme; localStorage.removeItem('theme'); }
    else                      { html.dataset.theme = next; localStorage.setItem('theme', next); }
  } catch { html.dataset.theme = next; }
  _syncThemeLabel();
});
_darkMQ.addEventListener?.('change', _syncThemeLabel);
_syncThemeLabel();

// ─── Events: Folder picker ────────────────────────────
// Prefer the File System Access API (Chrome/Edge): its permission prompt says
// "view files", whereas <input webkitdirectory> makes Chrome ask to "upload"
// files — misleading, since nothing is ever sent. Other browsers fall back.
async function pickFolder() {
  if (_loading) return;
  if (!window.showDirectoryPicker) return EL.folderInput.click();
  let dir;
  try {
    dir = await window.showDirectoryPicker({ id: 'game-folder', mode: 'read' });
  } catch (e) {
    if (e.name !== 'AbortError') EL.folderInput.click();
    return;
  }
  await openFolderLazy(dir.name, [{ fs: FS_HANDLE, root: dir }]);
}

EL.openBtn.addEventListener('click', pickFolder);
$('open-game-btn').addEventListener('click', pickFolder);
EL.folderInput.addEventListener('change', async () => {
  const files = Array.from(EL.folderInput.files);
  EL.folderInput.value = '';
  if (files.length) await openFileList(files);
});

// ─── Events: RGSSAD archive ───────────────────────────
$('load-rgssad-btn').addEventListener('click', () => { if (!_loading) EL.rgssadInput.click(); });
EL.rgssadInput.addEventListener('change', async () => {
  const f = EL.rgssadInput.files[0];
  if (!f) return;
  EL.rgssadInput.value = '';
  await openArchive(f);
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

// Directory walking and lazy loading live in js/scan.js.

async function handleDrop(dataTransfer) {
  if (_loading) return;

  // Collect entries synchronously before any await
  const pairs = [];
  for (const item of dataTransfer.items) {
    if (item.kind !== 'file') continue;
    pairs.push({ item, entry: item.webkitGetAsEntry?.(), file: item.getAsFile?.() });
  }

  // Archive drop
  const arch = pairs.find(p => p.entry?.isFile !== false && /\.(rgssad|rgss2a|rgss3a)$/i.test(p.entry?.name || p.file?.name || ''));
  if (arch) {
    const file = arch.file || await new Promise((res, rej) => arch.entry.file(res, rej));
    await openArchive(file);
    return;
  }

  // Folder drop
  const dirPair = pairs.find(p => p.entry?.isDirectory);
  if (!dirPair) return;

  // Ask for the handle now: the DataTransfer is only valid during the drop event.
  const handlePromise = typeof dirPair.item.getAsFileSystemHandle === 'function'
    ? dirPair.item.getAsFileSystemHandle().catch(() => null)
    : Promise.resolve(null);

  // Modern File System Access API first, legacy FileSystem Entry API fallback.
  await openFolderLazy(dirPair.entry.name, [
    { fs: FS_HANDLE, root: handlePromise.then(h => h?.kind === 'directory' ? h : null) },
    { fs: FS_ENTRY,  root: dirPair.entry },
  ]);
}

let _dragDepth = 0;
document.addEventListener('dragenter', e => {
  if (!e.dataTransfer.types.includes('Files') || _loading) return;
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
          data = new Uint8Array(decryptMVMZ(await (await entryFile(entry)).arrayBuffer(), S.key));
        } else {
          data = new Uint8Array(await (await entryFile(entry)).arrayBuffer());
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


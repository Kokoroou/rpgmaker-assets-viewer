// ─── Restore persisted sidebar width ──────────────────
const _sw = localStorage.getItem('sidebarWidth');
if (_sw) document.documentElement.style.setProperty('--sw', _sw + 'px');

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
function loadMVMZFolder(files) {
  clearBlobCache();
  S.files.clear();
  S.folders.clear();

  for (const f of files) {
    if (!MEDIA_EXT.test(f.name)) continue;
    const rel    = f.webkitRelativePath;
    const parts  = rel.split('/');
    const folder = parts.length >= 3 ? parts.slice(1, -1).join('/') : '__root__';
    const isAudio = AUDIO_EXT.test(f.name);
    S.files.set(rel, { name: f.name, path: rel, isAudio, isImage: !isAudio, _file: f });
    if (!S.folders.has(folder)) S.folders.set(folder, []);
    S.folders.get(folder).push(rel);
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

  const rgssadFile = allFiles.find(f => /\.(rgssad|rgss2a|rgss3a)$/i.test(f.name));
  if (rgssadFile) {
    await loadRGSSAD(rgssadFile);
    return;
  }

  const sysJson = allFiles.find(f =>
    f.name === 'System.json' && f.webkitRelativePath.toLowerCase().includes('/data/')
  );
  if (sysJson) {
    try {
      const json = JSON.parse(await sysJson.text());
      if (json.encryptionKey) applyKey(json.encryptionKey);
    } catch {}
  }

  loadMVMZFolder(allFiles);
}

// ─── Grid activation ──────────────────────────────────
function showGrid() {
  EL.countBadge.textContent = S.files.size ? `${S.files.size} items` : '';
  renderSidebar();
  const first = S.folders.keys().next().value;
  if (first) {
    EL.setup.style.display    = 'none';
    EL.toolbar.classList.add('show');
    EL.gridWrap.style.display = 'block';
    showFolder(first);
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
    EL.grid.innerHTML = '';
    EL.folderPath.innerHTML = '';
    EL.countBadge.textContent = '';
    EL.searchBox.value = '';
    S.query = '';
    await loadGameFolder(files);
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
EL.lightbox.addEventListener('click', e => { if (e.target === EL.lightbox) closeLightbox(); });
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

// ─── Events: Keyboard ─────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
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


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
  if (st) { st.textContent = '⟳ Reading archive…'; st.className = 'info'; }
  try {
    const buf    = await file.arrayBuffer();
    const parsed = parseRGSSAD(buf);

    clearBlobCache();
    S.files.clear();
    S.folders.clear();

    for (const item of parsed) {
      if (!MEDIA_EXT.test(item.name)) continue;
      const parts   = item.name.split('/');
      const folder  = parts.length > 1 ? parts.slice(0, -1).join('/') : '__root__';
      const isAudio = AUDIO_EXT.test(item.name);
      S.files.set(item.name, {
        name: item.name, path: item.name,
        isAudio, isImage: !isAudio,
        _getData: item.getData,
      });
      if (!S.folders.has(folder)) S.folders.set(folder, []);
      S.folders.get(folder).push(item.name);
    }

    if (st) { st.textContent = `✓ Loaded ${S.files.size} items from "${file.name}"`; st.className = 'ok'; }
    showGrid();
  } catch (e) {
    if (st) { st.textContent = `✕ ${e.message}`; st.className = 'err'; }
  }
}

// ─── Auto-detect game folder ──────────────────────────
async function loadGameFolder(allFiles) {
  const st = EL.setupStatus;
  if (st) { st.textContent = '⟳ Analyzing folder…'; st.className = 'info'; }

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
  if (EL.lightbox.classList.contains('open')) {
    if (e.key === 'Escape')                      closeLightbox();
    if (e.key === 'ArrowLeft'  || e.key === 'a') lbMove(-1);
    if (e.key === 'ArrowRight' || e.key === 'd') lbMove(+1);
  }
});


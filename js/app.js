// ─── System.json reader ───────────────────────────────
async function readSystemJson(file, feedbackEl, onSuccess) {
  try {
    const json = JSON.parse(await file.text());
    const key  = json.encryptionKey;
    if (!key) { setFeedback(feedbackEl, 'err', '✕ Không tìm thấy encryptionKey trong file này'); return; }
    if (json.hasEncryptedImages === false)
      setFeedback(feedbackEl, 'warn', `⚠ Key: ${key.slice(0, 12)}…  (game này không mã hóa ảnh)`);
    else
      setFeedback(feedbackEl, 'ok', `✓ Đọc được key từ "${json.gameTitle || file.name}"`);
    onSuccess(key);
  } catch (e) {
    setFeedback(feedbackEl, 'err', `✕ Lỗi: ${e.message}`);
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
  const fb = $('rgssad-feedback');
  setFeedback(fb, 'warn', '⟳ Đang đọc archive…');
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

    setFeedback(fb, 'ok', `✓ Đọc được ${S.files.size} mục từ "${file.name}"`);
    showGrid();
  } catch (e) {
    setFeedback(fb, 'err', `✕ ${e.message}`);
  }
}

// ─── Grid activation ──────────────────────────────────
function showGrid() {
  EL.countBadge.textContent = S.files.size ? `${S.files.size} mục` : '';
  renderSidebar();
  const first = S.folders.keys().next().value;
  if (first) {
    EL.setup.style.display    = 'none';
    EL.toolbar.classList.add('show');
    EL.gridWrap.style.display = 'block';
    showFolder(first);
  }
}

// ─── Events: Setup Step 1 (key) ───────────────────────
EL.loadSysBtn.addEventListener('click', () => EL.sysJsonInput.click());
EL.sysJsonInput.addEventListener('change', async () => {
  const f = EL.sysJsonInput.files[0];
  if (!f) return;
  EL.sysJsonInput.value = '';
  await readSystemJson(f, EL.step1Feedback, k => {
    EL.manualKeyInput.value = k;
    applyKey(k);
  });
});

EL.manualKeySave.addEventListener('click', () => {
  const k = EL.manualKeyInput.value.trim().toLowerCase();
  if (!k) { setFeedback(EL.step1Feedback, 'err', '✕ Key không được để trống'); return; }
  if (!/^[0-9a-f]{32}$/.test(k)) {
    setFeedback(EL.step1Feedback, 'warn', '⚠ Key thường là chuỗi hex 32 ký tự — kiểm tra lại');
    return;
  }
  applyKey(k);
  setFeedback(EL.step1Feedback, 'ok', '✓ Đã lưu key');
});

// ─── Events: MV/MZ folder ─────────────────────────────
[EL.openBtn, EL.openBtnSetup].forEach(b => b.addEventListener('click', () => EL.folderInput.click()));
EL.folderInput.addEventListener('change', () => {
  const files = Array.from(EL.folderInput.files);
  if (files.length) loadMVMZFolder(files);
  EL.folderInput.value = '';
});

// ─── Events: RGSSAD archive ───────────────────────────
$('load-rgssad-btn').addEventListener('click', () => EL.rgssadInput.click());
EL.rgssadInput.addEventListener('change', async () => {
  const f = EL.rgssadInput.files[0];
  if (!f) return;
  EL.rgssadInput.value = '';
  await loadRGSSAD(f);
});

// ─── Events: Key modal ────────────────────────────────
EL.keyChip.addEventListener('click', () => {
  EL.modalKeyInput.value       = S.key;
  EL.modalStatus.textContent   = '';
  EL.modalStatus.style.cssText = '';
  EL.keyModal.classList.add('open');
  EL.modalKeyInput.focus();
});
EL.modalCloseBtn.addEventListener('click',  () => EL.keyModal.classList.remove('open'));
EL.modalCancelBtn.addEventListener('click', () => EL.keyModal.classList.remove('open'));
EL.keyModal.addEventListener('click', e => { if (e.target === EL.keyModal) EL.keyModal.classList.remove('open'); });

EL.modalLoadSysBtn.addEventListener('click', () => EL.sysJsonModalInput.click());
EL.sysJsonModalInput.addEventListener('change', async () => {
  const f = EL.sysJsonModalInput.files[0];
  if (!f) return;
  EL.sysJsonModalInput.value = '';
  try {
    const json = JSON.parse(await f.text());
    const key  = json.encryptionKey;
    if (!key) { showModalStatus('err', '✕ Không tìm thấy encryptionKey'); return; }
    EL.modalKeyInput.value = key;
    showModalStatus(json.hasEncryptedImages === false ? 'warn' : 'ok',
      json.hasEncryptedImages === false
        ? '⚠ Key đọc được nhưng game không mã hóa ảnh'
        : `✓ Đọc được key từ "${json.gameTitle || f.name}"`);
  } catch (e) {
    showModalStatus('err', `✕ Lỗi: ${e.message}`);
  }
});

EL.modalSaveBtn.addEventListener('click', () => {
  const k = EL.modalKeyInput.value.trim().toLowerCase();
  if (!k) { showModalStatus('err', '✕ Key không được để trống'); return; }
  applyKey(k);
  EL.keyModal.classList.remove('open');
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
  if (EL.keyModal.classList.contains('open')) return;
  if (EL.lightbox.classList.contains('open')) {
    if (e.key === 'Escape')                      closeLightbox();
    if (e.key === 'ArrowLeft'  || e.key === 'a') lbMove(-1);
    if (e.key === 'ArrowRight' || e.key === 'd') lbMove(+1);
  }
});

// ─── Init ─────────────────────────────────────────────
updateKeyUI();

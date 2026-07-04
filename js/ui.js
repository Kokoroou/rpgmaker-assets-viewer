// ─── DOM helpers ──────────────────────────────────────
const $ = id => document.getElementById(id);

const EL = {
  openBtn:          $('open-btn'),
  openBtnSetup:     $('open-btn-setup'),
  folderInput:      $('folder-input'),
  rgssadInput:      $('rgssad-input'),
  sysJsonInput:     $('sys-json-input'),
  sysJsonModalInput:$('sys-json-modal-input'),
  sidebar:          $('sidebar'),
  setup:            $('setup'),
  step1Card:        $('step1-card'),
  step1Num:         $('step1-num'),
  step1Status:      $('step1-status'),
  step1Feedback:    $('step1-feedback'),
  step2Status:      $('step2-status'),
  toolbar:          $('toolbar'),
  folderPath:       $('folder-path'),
  gridWrap:         $('grid-wrap'),
  grid:             $('grid'),
  emptySearch:      $('empty-search'),
  searchBox:        $('search-box'),
  sizeSlider:       $('size-slider'),
  countBadge:       $('count-badge'),
  keyChip:          $('key-chip'),
  keyLabel:         $('key-label'),
  loadSysBtn:       $('load-sys-btn'),
  manualKeyInput:   $('manual-key-input'),
  manualKeySave:    $('manual-key-save'),
  lightbox:         $('lightbox'),
  lbImg:            $('lb-img'),
  lbAudio:          $('lb-audio'),
  lbName:           $('lb-name'),
  lbMeta:           $('lb-meta'),
  lbClose:          $('lb-close'),
  lbPrev:           $('lb-prev'),
  lbNext:           $('lb-next'),
  lbCounter:        $('lb-counter'),
  lbDownload:       $('lb-download'),
  keyModal:         $('key-modal'),
  modalLoadSysBtn:  $('modal-load-sys-btn'),
  modalKeyInput:    $('modal-key-input'),
  modalStatus:      $('modal-status'),
  modalCloseBtn:    $('modal-close-btn'),
  modalCancelBtn:   $('modal-cancel-btn'),
  modalSaveBtn:     $('modal-save-btn'),
};

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
    data = entry._getData();
    url  = URL.createObjectURL(new Blob([data], { type: getMimeType(entry.name) }));
  } else if (ENC_IMAGE_EXT.test(entry.name) || ENC_AUDIO_EXT.test(entry.name)) {
    if (!S.key) throw new Error('Chưa có encryption key');
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

// ─── Key UI ───────────────────────────────────────────
function updateKeyUI() {
  const k = S.key;
  EL.keyChip.classList.toggle('has-key', !!k);
  EL.keyLabel.textContent = k ? k.slice(0, 8) + '…' + k.slice(-4) : 'Chưa có key';
  EL.keyChip.title = k ? `Key: ${k}\nClick để đổi` : 'Click để nhập key';
  if (k) {
    EL.step1Card.classList.add('done');
    EL.step1Num.textContent    = '✓';
    EL.step1Status.textContent = 'Đã có key';
    EL.step1Status.className   = 'step-status ok';
    EL.step2Status.textContent = 'Sẵn sàng';
    EL.step2Status.className   = 'step-status ok';
  } else {
    EL.step1Card.classList.remove('done');
    EL.step1Num.textContent    = '1';
    EL.step1Status.textContent = 'Chưa có';
    EL.step1Status.className   = 'step-status pending';
    EL.step2Status.textContent = 'Chờ bước 1';
    EL.step2Status.className   = 'step-status pending';
  }
}

function applyKey(key) {
  S.key = key;
  localStorage.setItem('rpg_enc_key', key);
  updateKeyUI();
  clearBlobCache();
  if (S.currentFolder) showFolder(S.currentFolder);
}

// ─── Feedback helpers ─────────────────────────────────
function setFeedback(el, type, msg) {
  el.textContent = msg;
  el.className   = `step-feedback ${type}`;
}

function showModalStatus(type, msg) {
  const s = {
    ok:   'color:var(--ok);background:rgba(52,211,153,.08);border:1px solid rgba(52,211,153,.2)',
    err:  'color:var(--err);background:rgba(248,113,113,.08);border:1px solid rgba(248,113,113,.2)',
    warn: 'color:var(--warn);background:rgba(251,191,36,.08);border:1px solid rgba(251,191,36,.2)',
  };
  EL.modalStatus.textContent = msg;
  EL.modalStatus.style.cssText = `padding:5px 10px;border-radius:3px;font-size:11px;${s[type]}`;
}

// ─── Sidebar ──────────────────────────────────────────
function renderSidebar() {
  EL.sidebar.innerHTML = '<div id="sidebar-header">Thư mục</div>';
  const sorted = [...S.folders.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  for (const [key, paths] of sorted) {
    const label = key === '__root__' ? '(root)' : key.split('/').pop();
    const el    = document.createElement('div');
    el.className      = 'folder-item';
    el.dataset.folder = key;
    el.title          = key;
    el.innerHTML = `
      <span class="f-icon">📁</span>
      <span class="f-name">${label}</span>
      <span class="f-count">${paths.length}</span>`;
    el.addEventListener('click', () => showFolder(key));
    EL.sidebar.appendChild(el);
  }
}

function setActiveFolder(key) {
  EL.sidebar.querySelectorAll('.folder-item').forEach(el =>
    el.classList.toggle('active', el.dataset.folder === key));
}

// ─── Grid ─────────────────────────────────────────────
function showFolder(key) {
  S.currentFolder = key;
  setActiveFolder(key);
  const all      = S.folders.get(key) || [];
  const q        = S.query.toLowerCase();
  const filtered = q ? all.filter(p => p.toLowerCase().includes(q)) : all;
  S.currentMedia = filtered;

  const label = key === '__root__' ? 'root' : key;
  EL.folderPath.innerHTML = `<strong>${label}</strong> &ensp;·&ensp; ${filtered.length} mục`;
  EL.grid.innerHTML       = '';
  EL.emptySearch.style.display = filtered.length ? 'none' : 'flex';

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
  S.lbIdx = idx;
  EL.lightbox.classList.add('open');
  await loadLbEntry(idx);
}

function closeLightbox() {
  EL.lbAudio.pause();
  EL.lightbox.classList.remove('open');
}

function lbMove(d) {
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
    alert(`Không thể tải: ${e.message}`);
  }
}

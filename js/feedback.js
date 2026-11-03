// ─── Feedback: 1-tap star rating + bug/idea form ─────────
// One small card (#feedback in index.html), one view at a time:
//   rate   — asked automatically ONCE, as soon as the 2nd game is on screen
//            (a first open says little; coming back for another one means the
//            tool was useful). Tapping a star SENDS the rating: 1 tap, done.
//            Non-modal, never blocks the grid or the picker; ignored for
//            IDLE_MS it slips away (counts as "not now"). Not shown with Do Not
//            Track / Global Privacy Control, on local copies, or when
//            localStorage is unavailable.
//   follow — right after the star: an optional one-line comment, Enter sends
//            it (as kind 'idea' carrying the same stars, plus the signed `ref`
//            the inbox returned for the star, so both become ONE entry and the
//            rating is not counted twice). Ignored, it closes by itself.
//   report — from About ("Report a bug or idea"): Bug / Idea + message.
//   thanks — short confirmation, closes by itself.
//
// Touch points (taps, not counting typing):
//   rate 1 · rate + comment 1 + Enter · dismiss 1 (or none: it slips away)
//   bug report from About 2 + Send (browser chip and type are preset)
//
// Remembered in localStorage['feedback'], never sent anywhere:
//   { v: 1, opens, done, skips, nextAt }
// A "don't ask again" flag like the theme preference, not an identifier.
//
// Sent ONLY when the user taps a star or presses Send, to the developer's feedback inbox
// (Cloudflare Worker at feedback.kokoroou.workers.dev, which validates exactly
// these fields and stores no IP or identifier):
//   { project, kind, rating, comment, lang, meta: { opens (bucket), browser (only if ticked) }, ref }
// `ref` is the opaque signed pointer to the star just sent (it names an entry, not a person);
// kept in a variable only, never in localStorage, gone when the tab closes.
// NEVER sent: file or folder names, game titles, engine, keys, contents.
// Do not add any of those — see "Legal constraints" in CLAUDE.md. The endpoint
// host is the only one besides GoatCounter in the CSP of index.html.
const Feedback = (() => {
  const ENDPOINT  = 'https://feedback.kokoroou.workers.dev/api/submit';
  const STORE_KEY = 'feedback';
  const ASK_AT    = 2;   // ask on the 2nd successful open
  const SKIP_GAP  = 5;   // "Not now" → ask again 5 opens later…
  const MAX_SKIPS = 2;   // …and never after the 2nd "Not now"
  const MAX_LEN   = 1000;
  const IDLE_MS   = 45000;   // untouched prompt slips away
  const FOLLOW_MS = 20000;   // untouched comment box closes

  const publicSite = location.hostname === 'kokoroou.github.io';
  const forced     = new URLSearchParams(location.search).has('feedback'); // test the prompt anywhere
  const noTrack    = navigator.doNotTrack === '1' || !!navigator.globalPrivacyControl;
  const event      = name => { if (typeof countEvent === 'function') countEvent(name); };

  const $f = id => document.getElementById(id);
  const card = $f('feedback'), errEl = $f('fb-error');
  const note = $f('fb-note'), noteSend = $f('fb-note-send');
  const msg = $f('fb-msg'), sendBtn = $f('fb-send'), env = $f('fb-env');

  // ── persisted state ──
  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
      return s && s.v === 1 ? s : { v: 1, opens: 0, done: false, skips: 0, nextAt: ASK_AT };
    } catch { return null; }
  }
  function save(s) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(s)); return true; } catch { return false; }
  }
  const bucket = n => n <= 0 ? '' : n <= 2 ? String(n) : n <= 5 ? '3-5' : n <= 10 ? '6-10' : '11+';

  // "Chrome 131 · Windows" — shown next to the checkbox, so the user sees exactly what is sent.
  function browserInfo() {
    const ua = navigator.userAgent;
    const m = ua.match(/(Edg|OPR|Firefox|Chrome|Version)\/(\d+)/g) || [];
    const pick = n => m.find(x => x.startsWith(n + '/'));
    const b = pick('Edg') ? 'Edge ' + pick('Edg').split('/')[1]
      : pick('OPR') ? 'Opera ' + pick('OPR').split('/')[1]
      : pick('Firefox') ? 'Firefox ' + pick('Firefox').split('/')[1]
      : pick('Chrome') ? 'Chrome ' + pick('Chrome').split('/')[1]
      : /Safari/.test(ua) && pick('Version') ? 'Safari ' + pick('Version').split('/')[1]
      : 'Other browser';
    const os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android'
      : /iPhone|iPad|iPod/.test(ua) ? 'iOS' : /Mac OS X/.test(ua) ? 'macOS'
      : /CrOS/.test(ua) ? 'ChromeOS' : /Linux/.test(ua) ? 'Linux' : 'Other OS';
    return `${b} · ${os}`;
  }

  // ── UI state ──
  let view = null, rating = 0, ratingRef = '', sending = false, showTimer = 0, idleTimer = 0, touched = false;

  function setView(v) {
    view = v;
    card.dataset.view = v;
    errEl.textContent = '';
    clearTimeout(idleTimer);
    touched = false;
    if (v === 'rate') idleTimer = setTimeout(() => { if (!touched) dismiss(); }, IDLE_MS);
    if (v === 'follow') idleTimer = setTimeout(() => { if (!touched && !note.value) close(); }, FOLLOW_MS);
    if (v === 'thanks') idleTimer = setTimeout(close, 1600);
  }

  function open(v) {
    card.querySelectorAll('form').forEach(f => f.reset());
    card.querySelectorAll('input[name="fb-rating"]').forEach(r => { r.checked = false; });
    rating = 0;
    ratingRef = '';
    note.style.height = '';
    noteSend.disabled = sendBtn.disabled = true;
    env.setAttribute('aria-pressed', 'true');
    $f('fb-env-value').textContent = browserInfo();
    syncKind();
    setView(v);
    card.hidden = false;
    requestAnimationFrame(() => card.classList.add('open'));
  }

  function close() {
    clearTimeout(idleTimer);
    card.classList.remove('open');
    card.hidden = true;
    view = null;
  }

  function syncKind() {
    const bug = $f('fb-kind-bug').checked;
    card.dataset.kind = bug ? 'bug' : 'idea';
    msg.placeholder = bug ? 'What happened? What did you do just before?' : 'Your idea or comment';
  }

  // ── automatic prompt ──
  // Called by commitLibrary() each time a game is on screen.
  function noteOpen(hasMedia) {
    if (!hasMedia || (!publicSite && !forced) || (noTrack && !forced)) return;
    const s = load();
    if (!s) return;                       // cannot remember the answer → never ask
    s.opens = Math.min((s.opens || 0) + 1, 999);
    if (!save(s)) return;
    if (forced || (!s.done && s.skips < MAX_SKIPS && s.opens >= s.nextAt)) scheduleShow();
  }

  // Shortly after the grid appears, and only when nothing else is in front.
  function scheduleShow() {
    clearTimeout(showTimer);
    let tries = 0;
    const busy = () => (typeof Loader !== 'undefined' && Loader.active)
      || document.getElementById('lightbox').classList.contains('open')
      || document.getElementById('about-modal').classList.contains('open')
      || document.visibilityState !== 'visible';
    const tryShow = () => {
      if (!card.hidden) return;
      if (busy()) { if (++tries < 120) showTimer = setTimeout(tryShow, 1000); return; }
      open('rate');
      event('feedback-shown');
    };
    showTimer = setTimeout(tryShow, 1500);
  }

  function dismiss() {
    if (sending) return;
    if (view === 'rate') {
      const s = load();
      if (s && !s.done) { s.skips = (s.skips || 0) + 1; s.nextAt = s.opens + SKIP_GAP; save(s); }
      event('feedback-skipped');
    }
    close();
  }

  // ── network ──
  async function post(fields) {
    const s = load() || {};
    const body = {
      project: 'makerlens',
      lang: (navigator.language || '').slice(0, 2).toLowerCase().replace(/[^a-z]/g, ''),
      website: $f('fb-website').value,   // honeypot, empty for humans
      ...fields,
      meta: { opens: bucket(s.opens || 0), ...(fields.meta || {}) },
    };
    // text/plain keeps it a "simple" CORS request (no preflight round trip).
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify(body),
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    });
    if (res.status === 429) throw new Error('Too many messages from your network. Try again in a minute.');
    if (!res.ok) throw new Error(`Couldn't send (error ${res.status}).`);
    // A star answers { ref }; everything else answers 204 with no body.
    if (res.status !== 200) return null;
    try { return await res.json(); } catch { return null; }
  }

  async function run(task, busyEl) {
    if (sending) return false;
    sending = true;
    errEl.textContent = '';
    busyEl?.classList.add('fb-busy');
    try {
      await task();
      return true;
    } catch (e) {
      errEl.textContent = e instanceof TypeError || !e.message
        ? (publicSite ? "Couldn't send. Check your connection and try again."
                      : 'Feedback can only be sent from the online site.')
        : e.message;
      return false;
    } finally {
      sending = false;
      busyEl?.classList.remove('fb-busy');
    }
  }

  // Star tapped → the rating is sent right away.
  async function rate(n) {
    rating = n;
    const ok = await run(async () => {
      const r = await post({ kind: 'rating', rating: n, comment: '' });
      ratingRef = typeof r?.ref === 'string' ? r.ref : '';
    }, card.querySelector('.fb-stars'));
    if (!ok) { card.querySelectorAll('input[name="fb-rating"]').forEach(r => { r.checked = false; }); return; }
    const s = load();
    if (s) { s.done = true; save(s); }
    event('feedback-sent');
    $f('fb-follow-q').textContent = n <= 3 ? 'What went wrong?' : n === 4 ? 'What would make it 5?' : 'What do you like most?';
    setView('follow');
  }

  async function sendNote() {
    const text = note.value.trim();
    if (!text) return;
    const ok = await run(() => post({ kind: 'idea', rating, comment: text.slice(0, MAX_LEN), ...(ratingRef && { ref: ratingRef }) }), card.querySelector('.fb-follow'));
    if (ok) { $f('fb-thanks-text').textContent = 'Thanks!'; setView('thanks'); }
  }

  async function sendReport() {
    const text = msg.value.trim();
    if (!text) return;
    const bug = $f('fb-kind-bug').checked;
    const browser = bug && env.getAttribute('aria-pressed') === 'true' ? browserInfo() : '';
    const ok = await run(() => post({ kind: bug ? 'bug' : 'idea', rating: null, comment: text.slice(0, MAX_LEN), meta: { browser } }),
      card.querySelector('.fb-report'));
    if (ok) { $f('fb-thanks-text').textContent = 'Sent. Thanks!'; setView('thanks'); }
  }

  // ── events ──
  card.querySelectorAll('input[name="fb-rating"]').forEach(r =>
    r.addEventListener('change', () => { if (r.checked) rate(+r.value); }));

  const grow = el => { el.style.height = 'auto'; el.style.height = el.scrollHeight + 2 + 'px'; };
  note.addEventListener('input', () => { touched = true; noteSend.disabled = !note.value.trim(); grow(note); });
  note.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); sendNote(); }
  });
  $f('fb-note-send').closest('form').addEventListener('submit', e => { e.preventDefault(); sendNote(); });

  msg.addEventListener('input', () => { sendBtn.disabled = !msg.value.trim(); });
  msg.addEventListener('keydown', e => {   // multi-line reports: Ctrl/Cmd+Enter sends
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); sendReport(); }
  });
  sendBtn.closest('form').addEventListener('submit', e => { e.preventDefault(); sendReport(); });
  card.querySelectorAll('input[name="fb-kind"]').forEach(r => r.addEventListener('change', syncKind));
  env.addEventListener('click', () => env.setAttribute('aria-pressed', env.getAttribute('aria-pressed') === 'true' ? 'false' : 'true'));

  // Any interaction keeps the card from slipping away.
  ['pointerdown', 'focusin', 'keydown'].forEach(t => card.addEventListener(t, () => { touched = true; }));
  $f('fb-close').addEventListener('click', dismiss);
  card.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); dismiss(); } });

  $f('about-feedback-btn').addEventListener('click', () => {
    clearTimeout(showTimer);
    document.getElementById('about-modal').classList.remove('open');
    open('report');
    setTimeout(() => msg.focus(), 50);
  });

  return { noteOpen, open };
})();

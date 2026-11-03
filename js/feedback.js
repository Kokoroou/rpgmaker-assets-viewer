// ─── Feedback: 5-star prompt + bug/idea form ─────────────
// One card (#feedback in index.html), two modes:
//   'rating' — asked automatically ONCE, as soon as the 2nd game is on screen
//              (a first open says little; coming back for another one means the
//              tool was useful). Non-modal, never blocks the grid or the picker.
//              Not shown with Do Not Track / Global Privacy Control, on local
//              copies, or when localStorage is unavailable.
//   'report' — opened by the user from About ("Report a bug / Suggest").
//
// Remembered in localStorage['feedback'], never sent anywhere:
//   { v: 1, opens, done, skips, nextAt }
// A "don't ask again" flag like the theme preference, not an identifier.
//
// Sent ONLY when the user presses Send, to the developer's feedback inbox
// (Cloudflare Worker at feedback.kokoroou.workers.dev, which validates exactly
// these fields and stores no IP or identifier):
//   { project, kind, rating, comment, lang, meta: { opens (bucket), browser (only if ticked) } }
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
  const LABELS    = ['Poor', 'Fair', 'Good', 'Very good', 'Excellent'];

  const publicSite = location.hostname === 'kokoroou.github.io';
  const forced     = new URLSearchParams(location.search).has('feedback'); // test the prompt anywhere
  const noTrack    = navigator.doNotTrack === '1' || !!navigator.globalPrivacyControl;
  const event      = name => { if (typeof countEvent === 'function') countEvent(name); };

  const $f = id => document.getElementById(id);
  const card = $f('feedback'), form = $f('fb-form'), comment = $f('fb-comment');
  const sendBtn = $f('fb-send'), errEl = $f('fb-error');

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
  let mode = 'rating', rating = 0, sending = false, showTimer = 0, closeTimer = 0;

  function reset(newMode) {
    mode = newMode;
    rating = 0;
    form.reset();
    card.dataset.mode = mode;
    delete card.dataset.rating;
    $f('fb-rating-label').textContent = '';
    $f('fb-count').textContent = `0/${MAX_LEN}`;
    errEl.textContent = '';
    form.querySelector('.fb-body').hidden = false;
    $f('fb-thanks').hidden = true;
    sendBtn.textContent = 'Send';
    $f('fb-browser-value').textContent = browserInfo();
    if (mode === 'rating') {
      $f('fb-title').textContent = 'How is MakerLens working for you?';
      $f('fb-sub').textContent = 'One quick rating helps decide what to improve next.';
      $f('fb-skip').textContent = 'Not now';
    } else {
      $f('fb-title').textContent = 'Report a bug or suggest an idea';
      $f('fb-sub').textContent = 'Goes straight to the developer. Anonymous.';
      $f('fb-skip').textContent = 'Cancel';
      $f('fb-browser').checked = true;   // shown with its exact value, the user can untick it
    }
    syncKind();
    syncSend();
  }

  function syncKind() {
    const bug = mode === 'report' && $f('fb-kind-bug').checked;
    card.dataset.kind = mode === 'report' ? (bug ? 'bug' : 'idea') : 'rating';
    $f('fb-comment-label').firstChild.textContent = mode === 'rating'
      ? (rating && rating <= 3 ? 'What should be better? ' : 'Anything to improve, missing, or just to say? ')
      : bug ? 'What went wrong? What did you do just before? ' : 'Your idea or comment ';
    comment.placeholder = mode === 'report' && bug
      ? 'e.g. "Audio in an MZ game does not play in Firefox"'
      : 'Ideas, problems, thoughts…';
  }

  function syncSend() {
    sendBtn.disabled = sending || (mode === 'rating' ? !rating : !comment.value.trim());
  }

  function open(newMode) {
    clearTimeout(closeTimer);
    reset(newMode);
    card.hidden = false;
    requestAnimationFrame(() => card.classList.add('open'));
  }

  function close() {
    card.classList.remove('open');
    card.hidden = true;
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
      open('rating');
      event('feedback-shown');
    };
    showTimer = setTimeout(tryShow, 1500);
  }

  function dismiss() {
    if (sending) return;
    if (mode === 'rating') {
      const s = load();
      if (s && !s.done) { s.skips = (s.skips || 0) + 1; s.nextAt = s.opens + SKIP_GAP; save(s); }
      event('feedback-skipped');
    }
    close();
  }

  // ── send ──
  async function send() {
    if (sendBtn.disabled) return;
    const s = load() || {};
    const browser = mode === 'report' && $f('fb-browser').checked ? browserInfo() : '';
    const body = {
      project: 'makerlens',
      kind: mode === 'rating' ? 'rating' : ($f('fb-kind-bug').checked ? 'bug' : 'idea'),
      rating: mode === 'rating' ? rating : null,
      comment: comment.value.trim().slice(0, MAX_LEN),
      lang: (navigator.language || '').slice(0, 2).toLowerCase().replace(/[^a-z]/g, ''),
      meta: { opens: bucket(s.opens || 0), browser },
      website: $f('fb-website').value,   // honeypot, empty for humans
    };
    errEl.textContent = '';
    sending = true;
    syncSend();
    sendBtn.textContent = 'Sending…';
    try {
      // text/plain keeps it a "simple" CORS request (no preflight round trip).
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        body: JSON.stringify(body),
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
      });
      if (res.status === 429) throw new Error('Too many messages from your network. Please try again in a minute.');
      if (!res.ok) throw new Error(`Couldn't send (error ${res.status}).`);
      if (mode === 'rating' && s.v) { s.done = true; save(s); }
      if (mode === 'rating') event('feedback-sent');
      form.querySelector('.fb-body').hidden = true;
      $f('fb-thanks').hidden = false;
      closeTimer = setTimeout(close, 2200);
    } catch (e) {
      errEl.textContent = e instanceof TypeError || !e.message
        ? (publicSite ? "Couldn't send. Check your connection and try again."
                      : 'Feedback can only be sent from the online site. You can open a GitHub issue instead.')
        : e.message;
      sendBtn.textContent = 'Send';
    } finally {
      sending = false;
      syncSend();
    }
  }

  // ── events ──
  form.querySelectorAll('input[name="fb-rating"]').forEach(r => r.addEventListener('change', () => {
    rating = +r.value;
    card.dataset.rating = rating;
    $f('fb-rating-label').textContent = LABELS[rating - 1];
    syncKind();
    syncSend();
  }));
  form.querySelectorAll('input[name="fb-kind"]').forEach(r => r.addEventListener('change', syncKind));
  comment.addEventListener('input', () => {
    $f('fb-count').textContent = `${comment.value.length}/${MAX_LEN}`;
    syncSend();
  });
  $f('fb-close').addEventListener('click', dismiss);
  $f('fb-skip').addEventListener('click', dismiss);
  form.addEventListener('submit', e => { e.preventDefault(); send(); });
  card.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); dismiss(); } });

  $f('about-feedback-btn').addEventListener('click', () => {
    clearTimeout(showTimer);
    document.getElementById('about-modal').classList.remove('open');
    open('report');
    setTimeout(() => comment.focus(), 50);
  });

  return { noteOpen, open };
})();

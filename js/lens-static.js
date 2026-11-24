// Theme toggle for the static pages (faq.html, privacy.html) in the MakerLens look.
// The app has its own handler in app.js; this one uses the same rule and the same key ('theme'):
// picking the theme the OS already uses clears the override. Does nothing on the legacy copy.
(function () {
  var root = document.documentElement;
  if (!root.hasAttribute('data-lens')) return;
  var btn = document.querySelector('[data-lens-theme]');
  if (!btn) return;
  var mq = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;
  function sys() { return mq && mq.matches ? 'dark' : 'light'; }
  function cur() { return root.getAttribute('data-theme') || sys(); }
  function label() {
    var next = cur() === 'dark' ? 'light' : 'dark';
    btn.setAttribute('aria-label', 'Switch to ' + next + ' theme');
    btn.setAttribute('title', 'Switch to ' + next + ' theme');
  }
  btn.addEventListener('click', function () {
    var next = cur() === 'dark' ? 'light' : 'dark';
    try {
      if (next === sys()) { root.removeAttribute('data-theme'); localStorage.removeItem('theme'); }
      else { root.setAttribute('data-theme', next); localStorage.setItem('theme', next); }
    } catch (e) { root.setAttribute('data-theme', next); }
    label();
  });
  label();
}());

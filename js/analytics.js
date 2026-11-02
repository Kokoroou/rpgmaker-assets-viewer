// ─── Anonymous page-view counter (GoatCounter) ────────
// Sends ONE request per page load to GoatCounter's documented /count
// endpoint (https://www.goatcounter.com/help/pixel). No cookies, no
// localStorage, no fingerprinting. GoatCounter does not store IP addresses.
//
// Sent:     page path, referrer (the site the visitor came from)
// NEVER sent: file names, folder names, game titles, keys, file contents.
// Do not add any of those here — see "Legal constraints" in CLAUDE.md.
//
// The Content-Security-Policy in index.html only allows this host,
// so the page cannot send data anywhere else.
(function () {
  var GC_ENDPOINT = 'https://makerlens.goatcounter.com/count';

  // Only count the public site, not local copies or previews.
  if (location.hostname !== 'kokoroou.github.io') return;
  // Respect Do Not Track / Global Privacy Control.
  if (navigator.doNotTrack === '1' || navigator.globalPrivacyControl) return;

  var params = new URLSearchParams({
    p: location.pathname,
    r: document.referrer,
    rnd: Math.random().toString(36).slice(2)
  });
  new Image().src = GC_ENDPOINT + '?' + params.toString();
}());

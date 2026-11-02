// ─── Anonymous page-view counter (GoatCounter) ────────
// Sends ONE request per page load to GoatCounter's documented /count
// endpoint (https://www.goatcounter.com/help/pixel). No cookies, no
// localStorage, no fingerprinting. GoatCounter does not store IP addresses.
//
// Sent:     page path, referrer (the site the visitor came from), and the
//           traffic-source query params below (e.g. ChatGPT links carry
//           ?utm_source=chatgpt.com and often no Referer header)
// NEVER sent: file names, folder names, game titles, keys, file contents.
// Do not add any of those here — see "Legal constraints" in CLAUDE.md.
//
// The Content-Security-Policy in index.html only allows this host,
// so the page cannot send data anywhere else.
(function () {
  var GC_ENDPOINT = 'https://kokoroou.goatcounter.com/count';
  // Query params GoatCounter reads as traffic source / campaign.
  // Anything else in the URL is not sent.
  var SOURCE_PARAMS = ['utm_source', 'ref', 'src', 'source', 'utm_campaign', 'campaign'];

  // Only count the public site, not local copies or previews.
  if (location.hostname !== 'kokoroou.github.io') return;
  // Respect Do Not Track / Global Privacy Control.
  if (navigator.doNotTrack === '1' || navigator.globalPrivacyControl) return;

  var here = new URLSearchParams(location.search), q = new URLSearchParams();
  SOURCE_PARAMS.forEach(function (k) { if (here.get(k)) q.set(k, here.get(k)); });

  var params = new URLSearchParams({
    p: location.pathname,
    r: document.referrer,
    rnd: Math.random().toString(36).slice(2)
  });
  if (q.toString()) params.set('q', '?' + q.toString());
  new Image().src = GC_ENDPOINT + '?' + params.toString();
}());

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
// Events: countEvent(name) counts one of the fixed names in EVENTS (js/feedback.js:
// how many asked users answer; js/app.js: someone switched to MakerLens Events).
// Only the event name is sent — no rating, no comment, nothing about files.
// It returns a Promise that resolves once the request has been answered (or after
// 400 ms), so a page that navigates right after can wait for it.
//
// The Content-Security-Policy in index.html only allows this host (and the
// feedback endpoint, called only when the user presses Send).
var countEvent = function () { return Promise.resolve(); };
(function () {
  var GC_ENDPOINT = 'https://makerlens.goatcounter.com/count';
  var EVENTS = ['feedback-shown', 'feedback-skipped', 'feedback-sent', 'switch-to-events'];
  // Query params GoatCounter reads as traffic source / campaign.
  // Anything else in the URL is not sent.
  var SOURCE_PARAMS = ['utm_source', 'ref', 'src', 'source', 'utm_campaign', 'campaign'];

  // Only count the public site (js/site.js), not local copies or previews.
  if (!SITE.isPublic) return;
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

  countEvent = function (name) {
    if (EVENTS.indexOf(name) < 0) return Promise.resolve();
    return new Promise(function (resolve) {
      var img = new Image();
      img.onload = img.onerror = function () { resolve(); };
      setTimeout(resolve, 400);
      img.src = GC_ENDPOINT + '?' + new URLSearchParams({
        p: name, t: name, e: 'true', rnd: Math.random().toString(36).slice(2)
      }).toString();
    });
  };
}());

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
// Events: countEvent(name) counts one of the fixed names in EVENTS (used by
// js/feedback.js to measure how many asked users answer). Only the event name
// is sent — no rating, no comment, nothing about files.
//
// The Content-Security-Policy in index.html only allows this host (and the
// feedback endpoint, called only when the user presses Send).
var countEvent = function () {};
(function () {
  var GC_ENDPOINT = 'https://kokoroou.goatcounter.com/count';
  var EVENTS = ['feedback-shown', 'feedback-skipped', 'feedback-sent'];
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

  countEvent = function (name) {
    if (EVENTS.indexOf(name) < 0) return;
    new Image().src = GC_ENDPOINT + '?' + new URLSearchParams({
      p: name, t: name, e: 'true', rnd: Math.random().toString(36).slice(2)
    }).toString();
  };
}());

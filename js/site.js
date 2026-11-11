// ─── Where the public site lives ──────────────────────
// Home:   https://makerlens.kokoroou.workers.dev/assets/   (Cloudflare Worker,
//         built from the Kokoroou/makerlens repo, which copies this repo in)
// Legacy: https://kokoroou.github.io/rpgmaker-assets-viewer/   (GitHub Pages,
//         still deployed by .github/workflows/deploy.yml; shows a "moved" banner)
//
// analytics.js and feedback.js use SITE.isPublic so local copies and previews
// stay silent. Each page loads this file before them.
var SITE = (function () {
  var HOME   = { host: 'makerlens.kokoroou.workers.dev', base: '/assets/' };
  var LEGACY = { host: 'kokoroou.github.io', base: '/rpgmaker-assets-viewer/' };

  // Same page on the new home; keeps the query (utm_source…) and the hash.
  function homeURL(pathname, search, hash) {
    var rest = pathname.indexOf(LEGACY.base) === 0 ? pathname.slice(LEGACY.base.length) : '';
    return 'https://' + HOME.host + HOME.base + rest + (search || '') + (hash || '');
  }

  // The GitHub Pages copy is retired after this day; the page then becomes the user guide
  // (with how to move to the new link). Shown in the "moved" banner.
  var RETIRE = { iso: '2026-11-30', text: '30 November 2026' };

  var host = typeof location === 'undefined' ? '' : location.hostname;
  return {
    isPublic: host === HOME.host || host === LEGACY.host,
    isLegacy: host === LEGACY.host,
    retireDate: RETIRE,
    homeURL: homeURL
  };
}());

// "We moved" banner, on the legacy site only.
(function () {
  if (!SITE.isLegacy || typeof document === 'undefined') return;
  var bar = document.createElement('div');
  bar.id = 'moved';
  bar.setAttribute('role', 'region');
  bar.setAttribute('aria-label', 'New address');
  var text = document.createElement('span');
  text.textContent = 'MakerLens has moved to a new address. This GitHub Pages site stops being used after ' +
    SITE.retireDate.text + '; it will then only be the user guide, which explains how to switch to the new link.';
  var link = document.createElement('a');
  link.textContent = 'Open the new site →';
  var sync = function () { link.href = SITE.homeURL(location.pathname, location.search, location.hash); };
  sync();
  link.addEventListener('mousedown', sync);
  link.addEventListener('click', sync);
  link.addEventListener('focus', sync);
  bar.appendChild(text);
  bar.appendChild(document.createTextNode(' '));
  bar.appendChild(link);
  document.body.insertBefore(bar, document.body.firstChild);
}());

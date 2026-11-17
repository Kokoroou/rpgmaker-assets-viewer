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
  text.textContent = 'MakerLens has a new home. Update your bookmarks before ' + SITE.retireDate.text + '.';
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

// "Try MakerLens Events" promo card, on the legacy site only: a square card in the
// bottom corner, so it does not compete with the "moved" banner at the top.
(function () {
  if (!SITE.isLegacy || typeof document === 'undefined') return;
  var NS = 'http://www.w3.org/2000/svg';
  function el(tag, attrs, parent) {
    var n = document.createElementNS(NS, tag);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  var card = document.createElement('aside');
  card.id = 'promo';
  card.setAttribute('aria-label', 'MakerLens Events');

  var close = document.createElement('button');
  close.type = 'button';
  close.className = 'promo-close';
  close.setAttribute('aria-label', 'Close');
  close.textContent = '\u00d7';
  close.addEventListener('click', function () { card.remove(); });

  // Little event graph: three nodes joined by edges.
  var art = el('svg', { 'class': 'promo-art', viewBox: '0 0 160 64', 'aria-hidden': 'true' });
  el('path', { d: 'M38 32 H62 M98 32 H122 M80 20 V8', fill: 'none', stroke: '#22c55e', 'stroke-width': '2', 'stroke-linecap': 'round' }, art);
  el('rect', { x: 8, y: 20, width: 30, height: 24, rx: 6, fill: '#1e293b', stroke: '#22c55e', 'stroke-width': '2' }, art);
  el('rect', { x: 62, y: 20, width: 36, height: 24, rx: 6, fill: '#22c55e' }, art);
  el('rect', { x: 122, y: 20, width: 30, height: 24, rx: 6, fill: '#1e293b', stroke: '#22c55e', 'stroke-width': '2' }, art);
  el('circle', { cx: 80, cy: 6, r: 4, fill: '#86efac' }, art);

  var badge = document.createElement('span');
  badge.className = 'promo-badge';
  badge.textContent = 'New';
  var title = document.createElement('strong');
  title.className = 'promo-title';
  title.textContent = 'See the Hidden Scenes';
  var text = document.createElement('p');
  text.textContent = 'MakerLens Events plays every scene in a game\u2019s data, even the ones you never unlocked. Free, in your browser.';
  var link = document.createElement('a');
  link.href = 'https://makerlens.kokoroou.workers.dev/events/';
  link.textContent = 'Watch Hidden Scenes \u2192';

  card.appendChild(close);
  card.appendChild(art);
  card.appendChild(badge);
  card.appendChild(title);
  card.appendChild(text);
  card.appendChild(link);
  document.body.appendChild(card);
}());

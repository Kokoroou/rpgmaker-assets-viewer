// MakerLens redesign gate. Loaded synchronously in <head> BEFORE the stylesheets.
// Every rule of css/lens.css sits under :root[data-lens], so the legacy GitHub Pages copy
// (kokoroou.github.io, which must keep its old look) renders exactly as before.
// Local copies, previews and the MakerLens home all get the new look.
// Same file in MakerLens Events. Do not add anything here that the legacy host would notice.
(function () {
  var d = document.documentElement;
  if (location.hostname === 'kokoroou.github.io') return;
  d.setAttribute('data-lens', '');

  // Keep the browser UI colour (<meta name="theme-color">) in step with the theme toggle:
  // the static metas only follow the OS setting, not a theme the user picked here.
  var COLORS = { light: '#f8fafc', dark: '#0b1120' };
  function paint() {
    var t = d.getAttribute('data-theme');
    var dark = t ? t === 'dark' : !!(window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
    var metas = document.querySelectorAll('meta[name="theme-color"]');
    for (var i = 0; i < metas.length; i++) {
      metas[i].removeAttribute('media');
      metas[i].setAttribute('content', COLORS[dark ? 'dark' : 'light']);
    }
  }
  try {
    new MutationObserver(paint).observe(d, { attributes: true, attributeFilter: ['data-theme'] });
    if (window.matchMedia) matchMedia('(prefers-color-scheme: dark)').addEventListener('change', paint);
  } catch (e) { /* older browsers keep the static metas */ }
}());

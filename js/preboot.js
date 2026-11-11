/* Early folder picking. This is the first app script, tiny on purpose: the Select Game
   Folder button works as soon as it is on screen, while the other scripts are still
   downloading and running. What the user picks or drops is kept here, and app.js takes it
   over with Preboot.attach() once it is ready. */
var Preboot = (function () {
  'use strict';
  var P = { ready: false, handlers: null, pending: null };
  var slice = Array.prototype.slice;

  function deliver(kind, value) {
    if (P.ready) P.handlers[kind](value);
    else P.pending = { kind: kind, value: value };
  }

  function pick() {
    if (P.ready) return;                    // the app's own handler does it from now on
    var input = document.getElementById('folder-input');
    if (!window.showDirectoryPicker) { input.click(); return; }
    window.showDirectoryPicker({ id: 'game-folder', mode: 'read' }).then(
      function (dir) { deliver('dir', dir); },
      function (e) { if (e && e.name !== 'AbortError') input.click(); }
    );
  }

  ['open-btn', 'open-game-btn'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener('click', pick);
  });

  var input = document.getElementById('folder-input');
  if (input) input.addEventListener('change', function () {
    if (P.ready) return;
    var files = slice.call(input.files);
    input.value = '';
    if (files.length) deliver('files', files);
  });

  // Drops before the app is ready: the entries must be read inside the event itself.
  var overlay = document.getElementById('drag-overlay'), depth = 0;
  document.addEventListener('dragenter', function (e) {
    if (P.ready || !e.dataTransfer.types || slice.call(e.dataTransfer.types).indexOf('Files') < 0) return;
    if (++depth === 1 && overlay) overlay.classList.add('active');
  });
  document.addEventListener('dragleave', function () {
    if (P.ready) return;
    if (--depth <= 0) { depth = 0; if (overlay) overlay.classList.remove('active'); }
  });
  document.addEventListener('dragover', function (e) { e.preventDefault(); });
  document.addEventListener('drop', function (e) {
    e.preventDefault();
    if (P.ready) return;
    depth = 0;
    if (overlay) overlay.classList.remove('active');
    var pairs = [];
    slice.call(e.dataTransfer.items || []).forEach(function (item) {
      if (item.kind !== 'file') return;
      pairs.push({ item: item, entry: item.webkitGetAsEntry && item.webkitGetAsEntry(), file: item.getAsFile && item.getAsFile() });
    });
    if (pairs.length) deliver('drop', pairs);
  });

  // app.js: from now on its own handlers run; hand over anything picked meanwhile.
  P.attach = function (handlers) {
    P.handlers = handlers;
    P.ready = true;
    if (P.pending) { var p = P.pending; P.pending = null; handlers[p.kind](p.value); }
  };
  return P;
}());

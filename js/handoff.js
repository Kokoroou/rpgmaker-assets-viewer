// Handoff: carries the open game folder from one MakerLens tool to the other (Assets <-> Events),
// so the viewer does not have to pick it again. No DOM here (tested in node). The same file lives
// in MakerLens Events.
//
// Both tools are on one origin (…/assets/ and …/events/), so they share IndexedDB. A folder picked
// with showDirectoryPicker gives a FileSystemDirectoryHandle, which can be stored there. The
// sending page puts the handle in, flags the tab (sessionStorage) and navigates; the receiving page
// takes the handle out at once and DELETES it, so nothing stays after the switch. No file name,
// path or content is stored, only the handle the browser itself issued, and nothing leaves the
// device. Read access: the browser keeps the grant while the origin stays open in the tab; when
// it asks again, the receiving page shows one button, because the prompt needs a click.
var Handoff = (function () {
  'use strict';
  var DB = 'makerlens-handoff', STORE = 'folder', KEY = 'game';
  var FLAG = 'ml-handoff';            // sessionStorage: this tab has a handle waiting
  var MAX_AGE = 2 * 60 * 1000;        // a handle nobody took within 2 minutes is stale
  var TOOLS = ['assets', 'events'];

  // "…/assets/index.html" -> "…/events/" (relative to wherever the pair is served), else null:
  // only the two tools side by side can hand over (not a local copy of one, not GitHub Pages).
  function peerURL(tool, pathname) {
    if (TOOLS.indexOf(tool) < 0) return null;
    var m = /^(.*\/)(assets|events)\/[^/]*$/.exec(pathname || '');
    return m ? m[1] + tool + '/' : null;
  }

  function idb(g) { return (g || globalThis).indexedDB || null; }

  function wrap(req) {
    return new Promise(function (resolve, reject) {
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error || new Error('IndexedDB request failed')); };
    });
  }
  function finish(tx) {
    return new Promise(function (resolve, reject) {
      tx.oncomplete = function () { resolve(); };
      tx.onerror = tx.onabort = function () { reject(tx.error || new Error('IndexedDB transaction failed')); };
    });
  }
  function open(g) {
    var factory = idb(g);
    if (!factory) return Promise.reject(new Error('IndexedDB is not available'));
    var req = factory.open(DB, 1);
    req.onupgradeneeded = function () {
      var db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    return wrap(req);
  }

  function flag(g, on) {
    try {
      var ss = (g || globalThis).sessionStorage;
      if (on) ss.setItem(FLAG, '1'); else ss.removeItem(FLAG);
      return true;
    } catch (e) { return false; }
  }
  function flagged(g) {
    try { return (g || globalThis).sessionStorage.getItem(FLAG) === '1'; } catch (e) { return false; }
  }

  // The tab can hand over: IndexedDB works and the pair is served side by side.
  function ready(tool, pathname, g) {
    return !!idb(g) && peerURL(tool, pathname) !== null;
  }

  // Store the handle for the other tool. Resolves when it is safely written.
  function send(handle, g, now) {
    return open(g).then(function (db) {
      var tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put({ handle: handle, at: now == null ? Date.now() : now }, KEY);
      return finish(tx).then(function () {
        db.close();
        if (!flag(g, true)) throw new Error('This tab cannot keep the handover');
      });
    });
  }

  // The handle left for this page, or null. Always removes it (taken or stale).
  function receive(g, now) {
    if (!flagged(g)) return Promise.resolve(null);   // normal visits never touch IndexedDB
    flag(g, false);
    return open(g).then(function (db) {
      var tx = db.transaction(STORE, 'readwrite');
      var store = tx.objectStore(STORE);
      var got = wrap(store.get(KEY));
      store.delete(KEY);
      return Promise.all([got, finish(tx)]).then(function (r) {
        db.close();
        var v = r[0];
        var t = now == null ? Date.now() : now;
        if (!v || !v.handle || v.handle.kind !== 'directory') return null;
        if (!(t - v.at < MAX_AGE)) return null;
        return v.handle;
      });
    }).catch(function () { return null; });
  }

  // 'granted' | 'prompt' | 'denied'. With ask=true (inside a click) the browser may prompt.
  function permission(handle, ask) {
    var opts = { mode: 'read' };
    if (!handle || !handle.queryPermission) return Promise.resolve('granted');
    return handle.queryPermission(opts).then(function (state) {
      if (state === 'granted' || !ask || !handle.requestPermission) return state;
      return handle.requestPermission(opts);
    }).catch(function () { return 'denied'; });
  }

  return { peerURL: peerURL, ready: ready, send: send, receive: receive, permission: permission };
}());

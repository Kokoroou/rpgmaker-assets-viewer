const S = {
  key:           '',        // fallback key (single game / loose files)
  keys:          new Map(),  // game folder path → key (several games in one folder)
  userNav:       false,      // the user picked a folder, so auto-selection stops
  files:         new Map(),  // path → entry {name, path, isAudio, isImage, _file? | _resolve? | _getData?}
  folders:       new Map(),  // folderKey → [path]
  folderStats:   null,       // folderKey → {total, ready} while a lazy scan loads files (js/scan.js)
  currentFolder: null,
  sidebarPath:   null,       // folder key currently shown in sidebar (null = root level)
  currentMedia:  [],         // paths of visible entries (images + audio)
  hiddenCopies:  0,          // entries of the folder hidden by "Unique only" (js/dupes.js)
  filterPending: 0,          // entries of the folder whose size/length is still being read (js/filters.js)
  filterUnreadable: 0,       // entries hidden by a size/length bound because their header was not understood
  lbIdx:         0,
  blobCache:     new Map(),  // path → objectURL
  query:         '',
};

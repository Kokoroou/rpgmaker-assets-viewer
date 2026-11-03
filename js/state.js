const S = {
  key:           '',
  files:         new Map(),  // path → entry {name, path, isAudio, isImage, _file? | _resolve? | _getData?}
  folders:       new Map(),  // folderKey → [path]
  folderStats:   null,       // folderKey → {total, ready} while a lazy scan loads files (js/scan.js)
  currentFolder: null,
  sidebarPath:   null,       // folder key currently shown in sidebar (null = root level)
  currentMedia:  [],         // paths of visible entries (images + audio)
  lbIdx:         0,
  blobCache:     new Map(),  // path → objectURL
  query:         '',
};

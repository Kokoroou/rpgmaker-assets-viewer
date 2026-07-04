const S = {
  key:           localStorage.getItem('rpg_enc_key') || '',
  files:         new Map(),  // path → entry {name, path, isAudio, isImage, _file? | _getData?}
  folders:       new Map(),  // folderKey → [path]
  currentFolder: null,
  currentMedia:  [],         // paths of visible entries (images + audio)
  lbIdx:         0,
  blobCache:     new Map(),  // path → objectURL
  query:         '',
};

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the app

No build step. Open `index.html` directly in a browser:

```
# Windows
start index.html

# Or drag index.html into Chrome / Edge / Firefox
```

The app uses the browser File API (`webkitdirectory`, `arrayBuffer`, `Blob URL`) — these only work in a browser context, not Node.js. There are no dependencies, no package manager, no bundler.

## Architecture

`index.html` contains the HTML structure and all CSS. Logic is split into six JS files loaded in order:

```
js/constants.js      — regexes, EXT_REMAP, getMimeType(), canonicalExt()
js/state.js          — global S object
js/decrypt-mvmz.js   — decryptMVMZ(buffer, hexKey)
js/decrypt-rgssad.js — parseRGSSAD(buffer) → [{name, getData}]
js/ui.js             — DOM refs (EL), rendering, lightbox, entryToURL()
js/app.js            — event handlers, loadMVMZFolder(), loadRGSSAD(), init
```

All files share a single global scope — no modules.

**State object `S`** (global, in-memory):
- `S.key` — hex encryption key, persisted to `localStorage`
- `S.files` — `Map<path, entry>` for all media entries
- `S.folders` — `Map<folderKey, path[]>` grouping for the sidebar
- `S.currentFolder` / `S.currentMedia` — active folder key and filtered path list
- `S.blobCache` — `Map<path, objectURL>` to avoid re-decrypting on every render

**Entry model** (unified for both MV/MZ and RGSSAD):
```js
// From MV/MZ folder picker
{ name, path, isAudio, isImage, _file: File }

// From RGSSAD archive
{ name, path, isAudio, isImage, _getData: () => ArrayBuffer }
```

`entryToURL(entry)` in `ui.js` handles both types with blob cache.

**Two loading flows:**
1. **MV/MZ** — `readSystemJson()` → `applyKey()` → `loadMVMZFolder(files)`
2. **RGSSAD** — `loadRGSSAD(file)` → `parseRGSSAD(buffer)` → populate S → `showGrid()`

**Supported formats:**

| Engine | Extensions | Decryption |
|--------|-----------|------------|
| MZ images | `.png_` | 16-byte header + XOR 16 bytes with key |
| MV images | `.rpgmvp` | same as above |
| MZ audio | `.ogg_`, `.m4a_` | same as above |
| MV audio | `.rpgmvo`, `.rpgmvm` | same as above |
| XP/VX | `.rgssad`, `.rgss2a` | RGSSAD v1: key `0xDEADCAFE`, cycles per entry |
| VX Ace | `.rgss3a` | RGSSAD v3: master key from archive header |

**RGSSAD algorithms** (documented from `references/RPGMakerDecrypter`):
- v1 key evolution per name byte and per int: `key = (key * 7 + 3) >>> 0`
- v3 master key: `((uint32(header[8..11]) * 9) + 3) >>> 0`; file keys stored in directory
- Data decryption (both versions): XOR with key bytes, key advances every 4 bytes

**Key constants:**
- `RPG_HEADER` — `[0x52,0x50,0x47,0x4d,0x56,0,0,0,0,3,1,0,0,0,0,0]`
- `EXT_REMAP` — maps encrypted extensions to real ones (e.g. `png_` → `png`)

## References directory

`references/RPGMakerDecrypter/` contains a local clone of [uuksu/RPGMakerDecrypter](https://github.com/uuksu/RPGMakerDecrypter) (MIT, C#) kept for offline reference. It is excluded from git via `.gitignore`. Do not commit files from it; cite it in comments or docs instead.

## Legal constraints

- **Do not add server-side upload functionality.** All processing must stay client-side (File API only). This is a hard constraint for DMCA safety — the tool must never receive or store user game files on a server.
- **Do not distribute or embed actual game assets** (images, audio, scripts from any RPG Maker game) in this repository, even as test fixtures, without explicit rights.
- When extending decryption to new formats, document the format source (spec, reference implementation) in a code comment.

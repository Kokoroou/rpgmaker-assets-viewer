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

Everything lives in `index.html` as a single self-contained file: HTML structure, CSS custom-property design tokens, and vanilla JS state management — all inline.

**State object `S`** (global, in-memory):
- `S.key` — hex encryption key, persisted to `localStorage`
- `S.files` — `Map<relativePath, File>` for all image files from the picked folder
- `S.folders` — `Map<folderName, relativePath[]>` grouping for the sidebar
- `S.currentImages` — filtered subset currently shown in the grid
- `S.blobCache` — `Map<relativePath, objectURL>` to avoid re-decrypting on every render

**Data flow:**
1. User picks `data/System.json` → `readSystemJson()` extracts `encryptionKey` → `applyKey()` stores it and re-renders current folder
2. User picks `img/` folder → `folderInput` change handler flattens all files into `S.files` / `S.folders` → `renderSidebar()` + `showFolder()`
3. `showFolder(key)` filters `S.folders.get(key)` by `S.query`, sets `S.currentImages`, builds cards via `makeCard()`
4. `makeCard()` creates a card in `loading` state and registers it with `IntersectionObserver`; on intersection, `fileToURL(file)` decrypts (if `.rpgmvp`/`.png_`) or creates a plain Blob URL

**Decryption** (`decrypt()` function):
- Validates the 16-byte RPG Maker header (`RPG_HEADER` constant)
- Slices off the header, XORs the next 16 bytes with the key bytes
- Returns the recovered image bytes as an `ArrayBuffer`

**Key constants:**
- `RPG_HEADER` — `[0x52,0x50,0x47,0x4d,0x56,0,0,0,0,3,1,0,0,0,0,0]`
- `IMAGE_EXT` — regex matching all supported extensions
- `ENCRYPTED_EXT` — regex matching `.png_` and `.rpgmvp` (the ones that need decryption)

## References directory

`references/RPGMakerDecrypter/` contains a local clone of [uuksu/RPGMakerDecrypter](https://github.com/uuksu/RPGMakerDecrypter) (MIT, C#) kept for offline reference. It is excluded from git via `.gitignore`. Do not commit files from it; cite it in comments or docs instead.

## Legal constraints

- **Do not add server-side upload functionality.** All processing must stay client-side (File API only). This is a hard constraint for DMCA safety — the tool must never receive or store user game files on a server.
- **Do not distribute or embed actual game assets** (images, audio, scripts from any RPG Maker game) in this repository, even as test fixtures, without explicit rights.
- When extending decryption to new formats (e.g. `.rgssad` for XP/VX), document the format source (spec, reference implementation) in a code comment.

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

## Checks and CI/CD

Node (22+) runs the checks; still no dependencies:

```
node scripts/check-site.mjs        # JS syntax, CSP hashes + hosts, local links, FAQ JSON-LD vs page
node --test "tests/*.test.mjs"     # decrypt-mvmz / decrypt-rgssad / constants on synthetic bytes
```

Run both before pushing. Tests load `js/*.js` into a `node:vm` context (shared global scope, like the browser); fixtures are built in the test, never real game assets.

- `.github/workflows/ci.yml` — calls `kokoroou/agent-toolkit/.github/workflows/quality.yml@v0` (lint = `check-site.mjs`, test = `node --test`, plus Gitleaks + Semgrep) on PRs and pushes to `main`.
- `.github/workflows/deploy.yml` — on a push to `main`, reruns the two checks above, then publishes the public files (pages, `css/`, `js/`, images, `sitemap.xml`, `llms.txt`, `screenshots/`, LICENSE/LEGAL/README) to GitHub Pages. Requires Settings → Pages → Source = "GitHub Actions". A new top-level file the site serves must be added to its "Assemble site" step.
- `.github/dependabot.yml` — weekly updates of the pinned actions.

## Architecture

`index.html` contains the HTML structure; `privacy.html` is a static privacy page and `faq.html` a static FAQ page (keep long explanations there, the main UI stays terse). The FAQ's `FAQPage` JSON-LD must match its visible questions and answers. CSS is split into modules under `css/`. Logic is split into nine JS files loaded in order:

```
js/constants.js      — regexes, EXT_REMAP, getMimeType(), canonicalExt()
js/state.js          — global S object
js/decrypt-mvmz.js   — decryptMVMZ(buffer, hexKey)
js/decrypt-rgssad.js — parseRGSSAD(buffer) → [{name, getData}]
js/ui.js             — DOM refs (EL), rendering, sidebar tree, lightbox, entryFile()/entryToURL(), showEmptyState(), Loader (loading overlay)
js/scan.js           — lazy folder scan: FS_HANDLE/FS_ENTRY adapters, FolderScan, detectLazy(), background-loading chip (Bg)
js/app.js            — event handlers, runLoad()/loadGameFolder()/loadMVMZFolder()/loadRGSSAD(), ZIP writer (crc32, buildZip, downloadFolder)
js/feedback.js       — Feedback: one-time 1-tap star prompt (from the 2nd opened game, via commitLibrary → noteOpen), optional follow-up comment, and the About bug/idea form (#feedback)
js/analytics.js      — anonymous GoatCounter page-view ping (path, referrer, traffic-source params) + countEvent() for the fixed feedback-* events
```

All files share a single global scope — no modules.

**State object `S`** (global, in-memory):
- `S.key` — hex encryption key, read from `data/System.json`; in memory only (never persisted)
- `S.files` — `Map<path, entry>` for all media entries
- `S.folders` — `Map<folderKey, path[]>` grouping for the sidebar
- `S.currentFolder` / `S.currentMedia` — active folder key and filtered path list
- `S.blobCache` — `Map<path, objectURL>` to avoid re-decrypting on every render

**Entry model** (unified for both MV/MZ and RGSSAD):
```js
// From <input webkitdirectory> (File list already in hand)
{ name, path, isAudio, isImage, _file: File }

// From directory picker / drag & drop (lazy scan; File fetched on demand)
{ name, path, isAudio, isImage, _resolve: () => Promise<File> }

// From RGSSAD archive
{ name, path, isAudio, isImage, _getData: () => ArrayBuffer }
```

`entryFile(entry)` resolves the File once (shared promise); `entryToURL(entry)` handles all types with blob cache.

**Loading flows:**
1. **Folder via directory handle/entry** (picker, drag & drop) — `openFolderLazy(name, sources)` lists only the root, runs `detectLazy()` (archive at root → RGSSAD flow; else `data/System.json` key, engine), then starts a `FolderScan` and closes the overlay as soon as the first media folder is listed. The scan keeps listing directories (media dirs first) and resolving `getFile()` ("indexing": metadata only, no content read) in the background, the folder on screen first (`showFolder()` calls `Bg.scan.prioritize()`). While a thumbnail or the lightbox reads a file (`Fg.active`, `fgStart()` in `ui.js`) indexing pauses and listing drops to 1 request, so slow disks serve the user first; the `getFile()` pool starts at 4 and grows to 16 only when measured latency shows a fast disk. The status view's "Thumbnails on screen" row counts `Thumbs` (cards scrolled into view / decoded), not the whole folder. It fills the committed `S.files`/`S.folders` Maps in place; `S.folderStats` holds per-folder `{total, ready}` for the sidebar fill. The header chip `#bg-load` shows progress and reopens the loader as a status view (`Loader.open({view: true})`, button = Hide).
2. **Folder via `<input webkitdirectory>`** — `loadGameFolder(files)` auto-detects RGSSAD or calls `loadMVMZFolder(files)` (eager; the browser already resolved every File)
3. **RGSSAD** — `loadRGSSAD(file)` → `parseRGSSAD(buffer)` → populate S → `showGrid()`

**Loading overlay:** every open action goes through `runLoad(task)` in `app.js`, which drives `Loader` (`#loader`, `css/loader.css`): named steps (`detect`/`scan`/`load`/`current` for lazy folders, `scan`/`detect`/`index` for file lists, `read`/`table`/`index` for archives), a determinate or sweeping progress bar, Cancel and an error state. Loaders build into new Maps and only `commitLibrary()` swaps them into `S` (and aborts the previous background scan), so Cancel or a failure keeps the previously open game. Long loops call `Loader.check()` (throws `AbortError` after Cancel) at their yield points.

**Feedback:** `js/feedback.js` POSTs to the shared feedback inbox `https://feedback.kokoroou.workers.dev/api/submit` (Cloudflare Worker + D1 in the private repo `Kokoroou/feedbacks`, project key `makerlens`) only when the user taps a star (the rating is sent at once; the optional follow-up comment goes as kind `idea` with the same stars, so ratings are not counted twice) or presses Send. That Worker's `src/projects.js` allow-lists this site's origin and the `meta` fields (`opens`, `browser`); a new field must be added there too. The answered state lives in `localStorage['feedback']` (`{opens, done, skips, nextAt}`), never sent.

**ZIP download:** `downloadFolder()` in `app.js` reads raw data for each entry in `S.currentFolder`, applies decryption if needed, then calls `buildZip(items)` (uncompressed/store method, pure JS CRC32 via `_CRC32` table). Output is a Blob downloaded directly in-browser.

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
- **Analytics must never include user file data.** `js/analytics.js` may send only the page path, referrer and the traffic-source query params listed in `SOURCE_PARAMS`. Never send file/folder names, game titles, keys, or contents — knowing what users open would undermine the DMCA position in `LEGAL.md`. No cookies or storage-based identifiers (they would require a consent banner).
- **Feedback must never include user file data.** `js/feedback.js` may send only `project`, `kind`, `rating`, `comment`, `lang` and `meta.opens` (bucket) / `meta.browser` (bug reports only, shown as a chip the user can remove); the inbox Worker validates exactly these and must not store IP, user agent, headers or any identifier (only the day). The automatic prompt stays off with Do Not Track / GPC and on local copies. Update `privacy.html#feedback` when the payload changes.
- **Content-Security-Policy** is set by a `<meta>` tag in `index.html`, `privacy.html` and `faq.html`. Do not add external hosts to it beyond the GoatCounter endpoint and, in `index.html`'s `connect-src` only, the feedback inbox (`feedback.kokoroou.workers.dev`); `scripts/check-site.mjs` enforces this. If you edit the inline theme script in `<head>`, recompute its `sha256` hash in the CSP of all three pages or the script will be blocked.
- **Folder picker:** `pickFolder()` in `app.js` prefers `showDirectoryPicker` (Chrome/Edge prompt says "view files") and falls back to `<input webkitdirectory>` (Chrome's prompt for it says "upload", which contradicts the privacy promise).

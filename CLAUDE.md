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
- **Public home:** `https://makerlens.kokoroou.workers.dev/assets/` (one Cloudflare Worker for the whole MakerLens family, built and deployed by the `Kokoroou/makerlens` repo, which runs `scripts/assemble-site.sh` from this repo into `/assets/`). Canonical, `og:*`, JSON-LD and `llms.txt` use that URL. There is no `sitemap.xml` here: search engines only read the root domain's, so this tool's URLs live in `makerlens/site/sitemap.xml` (add new pages and bump `lastmod` there).
- `scripts/assemble-site.sh <dir>` — copies the public files (pages, `css/`, `js/`, images, `llms.txt`, `screenshots/`, LICENSE/LEGAL/README). A new top-level file the site serves must be added there.
- `.github/workflows/deploy.yml` — on a push to `main`, reruns the two checks above, then publishes the **legacy** copy to GitHub Pages (`kokoroou.github.io/rpgmaker-assets-viewer/`), which keeps old links working and shows the "moved" banner from `js/site.js`. Requires Settings → Pages → Source = "GitHub Actions".
- `.github/workflows/notify-makerlens.yml` — after a push to `main`, sends `repository_dispatch` (`tool-updated`) to `Kokoroou/makerlens` so the new home redeploys; needs the secret `MAKERLENS_DISPATCH_TOKEN` (skips with a notice without it).
- `.github/dependabot.yml` — weekly updates of the pinned actions.

## Architecture

`index.html` contains the HTML structure; `privacy.html` is a static privacy page and `faq.html` a static FAQ page (keep long explanations there, the main UI stays terse). The FAQ's `FAQPage` JSON-LD must match its visible questions and answers. CSS is split into modules under `css/`; `css/tokens.css` is the MakerLens family's design system (Events keeps a verbatim copy and the makerlens build checks they match, so after editing it, copy it to `rpgmaker-events-viewer/css/tokens.css`). Logic is split into fourteen JS files loaded in order:

```
js/preboot.js        — first script: Select Game Folder, folder input and drops work before the rest has loaded; Preboot.attach() at the end of app.js takes over what was picked
js/constants.js      — regexes, EXT_REMAP, getMimeType(), canonicalExt()
js/state.js          — global S object
js/decrypt-mvmz.js   — decryptMVMZ(buffer, hexKey)
js/decrypt-rgssad.js — parseRGSSAD(buffer) → [{name, getData}]
js/audio-loop.js    — parseOggLoop(buffer) → {rate,start,length,end}|null (LOOPSTART/LOOPLENGTH Vorbis comments)
js/sprite.js         — spriteLayout()/spriteFrame(): character sheet grid (`$` = 3×4, else 12×8) and walk cycle
js/ui.js             — DOM refs (EL), rendering, sidebar tree, lightbox (mouse wheel/drag zoom; touch: swipe prev/next/close, pinch, double-tap; one history entry so Back closes it), entryFile()/entryToURL(), showEmptyState(), Loader (loading overlay)
js/scan.js           — lazy folder scan: FS_HANDLE/FS_ENTRY adapters, FolderScan, detectLazy(), background-loading chip (Bg)
js/dupes.js          — Dupes: opt-in SHA-256 (crypto.subtle) of decrypted bytes in the background (yields to Fg.active), "Unique only" filter, ×N badges, virtual "Duplicates" folder (DUPES_KEY); pure helpers dupeGroups()/uniquePaths()/dupeList()
js/filters.js        — Filter: toolbar filter panel (#filter-panel: type, image width/height, audio length); reads only headers of the folder on screen in the background (yields to Fg.active); pure helpers imageSize()/oggDuration()/mp4Duration()/parseDuration()/filterMatch(); showFolder() and downloadFolder() go through Filter.apply()
js/remote.js         — Remote: game links made inside the game (⚙ → Share → MakerLens link) (Kokoroou/rpgmaker-web-toolkit): parseLink()/fromLocation()/client(); no DOM, tested in node; same file as in MakerLens Events
js/app.js            — event handlers, runLoad()/loadGameFolder()/loadMVMZFolder()/loadRGSSAD(), ZIP writer (crc32, buildZip, downloadFolder)
js/site.js           — SITE: public hosts (isPublic/isLegacy), homeURL() mapping legacy GitHub Pages URLs to /assets/ on the new home; on the legacy host inserts the "moved" banner (#moved, css/moved.css). Loaded first thing in <body> on all three pages (before app scripts, so the banner shows at once; moved.css is linked in <head>, never @imported)
js/feedback.js       — Feedback: one-time 1-tap star prompt (from the 2nd opened game, via commitLibrary → noteOpen), optional follow-up comment, and the About bug/idea form (#feedback)
js/analytics.js      — anonymous GoatCounter page-view ping (path, referrer, traffic-source params) + countEvent() for the fixed feedback-* events
```

All files share a single global scope — no modules.

The header logo is a plain link to the MakerLens home page (`https://makerlens.kokoroou.workers.dev/`); the open game is not kept (everything is in memory).

**State object `S`** (global, in-memory):
- `S.key` — fallback hex encryption key (single game at the root, or derived from a PNG header); in memory only (never persisted)
- `S.keys` — `Map<game folder path, key>`, one per `data/System.json` found, so a folder holding several games (different keys) works; `keyFor(path)` (ui.js) picks the deepest matching game folder, `decryptWithKey(buf, path)` uses it
- `S.userNav` — true once the user clicked a folder; until then the grid auto-selects the start folder (`pickStartFolder()` in app.js: `img/pictures` at any depth, else the first media folder). The lazy scan lists `img/pictures` ahead of everything else
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

`entryFile(entry)` resolves the File once (shared promise); `entryToURL(entry)` handles all types with blob cache; `entryBytes(entry)` returns the decrypted bytes uncached (ZIP export, duplicate hashing).

**Loading flows:**
1. **Folder via directory handle/entry** (picker, drag & drop) — `openFolderLazy(name, sources)` lists only the root, runs `detectLazy()` (archive at root → RGSSAD flow; else `data/System.json` key, engine), then starts a `FolderScan` and closes the overlay as soon as the first media folder is listed. The scan keeps listing directories (media dirs first) and resolving `getFile()` ("indexing": metadata only, no content read) in the background, the folder on screen first (`showFolder()` calls `Bg.scan.prioritize()`). While a thumbnail or the lightbox reads a file (`Fg.active`, `fgStart()` in `ui.js`) indexing pauses and listing drops to 1 request, so slow disks serve the user first; the `getFile()` pool starts at 4 and grows to 16 only when measured latency shows a fast disk. The status view's "Thumbnails on screen" row counts `Thumbs` (cards scrolled into view / decoded), not the whole folder. It fills the committed `S.files`/`S.folders` Maps in place; `S.folderStats` holds per-folder `{total, ready}` for the sidebar fill. The header chip `#bg-load` shows progress and reopens the loader as a status view (`Loader.open({view: true})`, button = Hide).
2. **Folder via `<input webkitdirectory>`** — `loadGameFolder(files)` auto-detects RGSSAD or calls `loadMVMZFolder(files)` (eager; the browser already resolved every File)
3. **RGSSAD** — `loadRGSSAD(file)` → `parseRGSSAD(buffer)` → populate S → `showGrid()`

4. **Game link** — "View another way" (one button on the start screen, `#alt-dialog`: Archive, Individual files, Game link). The link `…/assets/#game=<https://site.workers.dev>&t=<token>` comes from the game itself (⚙ → Share → MakerLens link, rpgmaker-web-toolkit); the token is in the `#` part so no server (MakerLens included) receives it, and `openFromAddress()` removes it from the address bar at once. `openRemote(link)` pings `<site>/_lens/ping`, reads `/_lens/manifest` (file names and sizes) and `data/System.json` (the key), then builds lazy entries (`_resolve: () => api.file(rel)`) like a folder scan; each file is fetched with `Authorization: Bearer` (no cookies) when first shown. Only `https://*.workers.dev` is accepted, which is also the only host added to `connect-src`. The token lives in memory only. `scripts/check-site.mjs` allows `*.workers.dev` in `index.html`'s CSP only. Documented in `privacy.html#game-link`; update it if the requests change.
5. **Individual files** — the same dialog: any image or audio file(s) (`.png_`, `.ogg_`, `.rpgmvp`, `.png`…) go to `openLooseFiles()` (the key is derived from the first encrypted PNG's header).

**Loading overlay:** every open action goes through `runLoad(task)` in `app.js`, which drives `Loader` (`#loader`, `css/loader.css`): named steps (`detect`/`scan`/`load`/`current` for lazy folders, `scan`/`detect`/`index` for file lists, `read`/`table`/`index` for archives), a determinate or sweeping progress bar, Cancel and an error state. Loaders build into new Maps and only `commitLibrary()` swaps them into `S` (and aborts the previous background scan), so Cancel or a failure keeps the previously open game. Long loops call `Loader.check()` (throws `AbortError` after Cancel) at their yield points.

**Feedback:** `js/feedback.js` POSTs to the shared feedback inbox `https://feedback.kokoroou.workers.dev/api/submit` (Cloudflare Worker + D1 in the private repo `Kokoroou/feedbacks`, project key `makerlens-assets`; MakerLens Events sends as `makerlens-events`) only when the user taps a star (the rating is sent at once and the Worker answers with a signed `ref` to that entry; the optional follow-up comment goes as kind `idea` with the same stars plus that `ref`, so both become one entry and ratings are not counted twice; `ref` lives in a variable only) or presses Send. The inbox keeps its projects in D1, managed with `PUT /api/projects/makerlens-assets` (service token, see the feedbacks README): they allow-list this site's origins (`https://makerlens.kokoroou.workers.dev` and the legacy `https://kokoroou.github.io`) and the `meta` fields (`opens`, `browser`); a new field or origin must be added there too, or every submit gets 403. The answered state lives in `localStorage['feedback']` (`{opens, done, skips, nextAt}`), never sent.

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
- **Feedback must never include user file data.** `js/feedback.js` may send only `project`, `kind`, `rating`, `comment`, `lang` and `ref` (the opaque pointer the Worker returned for the star just sent, memory only), `meta.opens` (bucket) / `meta.browser` (bug reports only, shown as a chip the user can remove); the inbox Worker validates exactly these and must not store IP, user agent, headers or any identifier (only the day). The automatic prompt stays off with Do Not Track / GPC and on local copies. Update `privacy.html#feedback` when the payload changes.
- **Content-Security-Policy** is set by a `<meta>` tag in `index.html`, `privacy.html` and `faq.html`. Do not add external hosts to it beyond the GoatCounter endpoint and, in `index.html`'s `connect-src` only, the feedback inbox (`feedback.kokoroou.workers.dev`) and `https://*.workers.dev` (game links); `scripts/check-site.mjs` enforces this. If you edit the inline theme script in `<head>`, recompute its `sha256` hash in the CSP of all three pages or the script will be blocked.
- **Folder picker:** `pickFolder()` in `app.js` prefers `showDirectoryPicker` (Chrome/Edge prompt says "view files") and falls back to `<input webkitdirectory>` (Chrome's prompt for it says "upload", which contradicts the privacy promise).

- **Page titles** follow the family format `{Topic} — {Qualifier} | MakerLens` (about 60 chars, `og:title`/`twitter:title` identical): see the Page titles section of `Kokoroou/makerlens` CLAUDE.md.

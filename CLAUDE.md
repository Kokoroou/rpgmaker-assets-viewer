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

`index.html` contains the HTML structure; `privacy.html` is a static privacy page and `faq.html` a static FAQ page (keep long explanations there, the main UI stays terse). The FAQ's `FAQPage` JSON-LD must match its visible questions and answers. CSS is split into modules under `css/`; `css/tokens.css` is the MakerLens family's design system (Events keeps a verbatim copy and the makerlens build checks they match, so after editing it, copy it to `rpgmaker-events-viewer/css/tokens.css`). Logic is split into sixteen JS files loaded in order:

```
js/preboot.js        — first script: Select Game Folder, folder input, drops and the View another way dialog work before the rest has loaded; Preboot.attach() at the end of app.js takes over what was picked
js/constants.js      — regexes, EXT_REMAP, getMimeType(), canonicalExt(), sniffMime()/mimeFor() (type by bytes: some games ship WebP as .png_), savedName() (download name from the real type); NEW_FEATURES (false on the legacy copy) gates mp3/wav/mid listing, typing by bytes and WAV lengths
js/xyz.js            — RPG Maker 2000/2003 .xyz images: xyzSize(), xyzToPng() (zlib palette + indices → indexed PNG with DecompressionStream/CompressionStream); used by entryToURL()/entryBytes() and the size filter
js/state.js          — global S object
js/decrypt-mvmz.js   — decryptMVMZ(buffer, hexKey)
js/decrypt-rgssad.js — parseRGSSAD(buffer) → [{name, getData}]
js/audio-loop.js    — parseOggLoop(buffer) → {rate,start,length,end}|null (LOOPSTART/LOOPLENGTH Vorbis comments)
js/sprite.js         — spriteLayout()/spriteFrame(): character sheet grid (`$` = 3×4, else 12×8) and walk cycle
js/ui.js             — DOM refs (EL), rendering, sidebar tree, lightbox (mouse wheel/drag zoom; touch: swipe prev/next/close, pinch, double-tap; one history entry so Back closes it), entryFile()/entryToURL(), showEmptyState(), Loader (loading overlay)
js/scan.js           — lazy folder scan: FS_HANDLE/FS_ENTRY adapters, FolderScan, detectLazy(), background-loading chip (Bg)
js/dupes.js          — Dupes: opt-in SHA-256 (crypto.subtle) of decrypted bytes in the background (yields to Fg.active), "Unique only" filter, ×N badges, virtual "Duplicates" folder (DUPES_KEY); pure helpers dupeGroups()/uniquePaths()/dupeList(). MakerLens look: the Duplicates row is always in the sidebar with the "Unique only" switch (`.row-switch`, `toggleUnique()` in app.js), and clicking the row hashes without hiding; the toolbar `#dupe-btn` is `lens-hide` (legacy copy only)
js/filters.js        — Filter: toolbar filter panel (#filter-panel: type, image width/height, audio length); reads only headers of the folder on screen in the background (yields to Fg.active); pure helpers imageSize()/oggDuration()/mp4Duration()/parseDuration()/filterMatch(); showFolder() and downloadFolder() go through Filter.apply()
js/handoff.js        — Handoff: carries the open folder's directory handle to MakerLens Events through IndexedDB (send/receive/permission/peerURL, no DOM, tested in node; same file as in MakerLens Events). Used by the Assets | Events switch (`#switch-tool`, css/switch.css) and `openHandoff()` at the end of app.js
js/remote.js         — Remote: game links made inside the game (⚙ → Share → MakerLens link) (Kokoroou/rpgmaker-web-toolkit): parseLink()/fromLocation()/client(); no DOM, tested in node; same file as in MakerLens Events
js/app.js            — event handlers, runLoad()/loadGameFolder()/loadMVMZFolder()/loadRGSSAD(), ZIP writer (crc32, buildZip, downloadFolder)
js/site.js           — SITE: public hosts (isPublic/isLegacy), homeURL() mapping legacy GitHub Pages URLs to /assets/ on the new home; on the legacy host inserts the "moved" banner (#moved, css/moved.css). Loaded first thing in <body> on all three pages (before app scripts, so the banner shows at once; moved.css is linked in <head>, never @imported)
js/feedback.js       — Feedback: one-time 1-tap star prompt (from the 2nd opened game, via commitLibrary → noteOpen), optional follow-up comment, and the About bug/idea form (#feedback)
js/analytics.js      — anonymous GoatCounter page-view ping (path, referrer, traffic-source params) + countEvent() for the fixed names in EVENTS, each at most once per page load; call it through track() (constants.js)
js/lens-gate.js      — tiny, loaded synchronously in <head> BEFORE the CSS on all three pages: sets <html data-lens> on every host except kokoroou.github.io (legacy), and keeps <meta name="theme-color"> in step with the theme toggle. On privacy.html (CSP without 'self') it is allowed by integrity="sha256-…" + the same hash in script-src; check-site.mjs checks the hash, so recompute it when you edit the file
js/lens-static.js    — theme toggle (same rule/key as app.js) for the lens-only header of faq.html and privacy.html; does nothing without data-lens (same hash rule on privacy.html)
```

All files share a single global scope — no modules.

The header logo is a plain link to the MakerLens home page (`https://makerlens.kokoroou.workers.dev/`); the open game is not kept (everything is in memory).

**State object `S`** (global, in-memory):
- `S.key` — fallback hex encryption key (single game at the root, or derived from a PNG header); in memory only (never persisted)
- `S.keys` — `Map<game folder path, key>`, one per `data/System.json` found, so a folder holding several games (different keys) works; `keyFor(path)` (ui.js) picks the deepest matching game folder, `decryptWithKey(buf, path)` uses it
- `S.userNav` — true once the user clicked a folder; until then the grid auto-selects the start folder (`pickStartFolder()` in app.js: `img/pictures` at any depth, or a `pictures` folder when `img/` itself was picked, else the first media folder). A pick with no image or audio (`data/`, a non-game folder) fails in the loader with `noMediaMessage()` (constants.js), which names the folder and says to pick the one above it, so the start screen and the open game stay. The lazy scan lists `img/pictures` ahead of everything else
- `S.files` — `Map<path, entry>` for all media entries
- `S.folders` — `Map<folderKey, path[]>` grouping for the sidebar
- `S.currentFolder` / `S.currentMedia` — active folder key and filtered path list; `folderPaths()` (ui.js) returns a folder in natural name order (`byName()`, constants.js: Actor2 before Actor10), the Duplicates folder in its own order

**Sidebar on phones** (≤ 600px): a drawer over the grid, closed after a game opens; `setSidebar(open)` (app.js) also drives the backdrop `#sidebar-scrim`. Picking a folder without subfolders closes it. Desktop keeps the column and its remembered state (`localStorage['sidebarHidden']`).
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

4. **Game link** — "View another way" (one button on the start screen, `#alt-dialog`: Archive, Individual files, Game link). The link `…/assets/#game=<https://site.workers.dev>&t=<token>` comes from the game itself (⚙ → Share → MakerLens link, rpgmaker-web-toolkit); the token is in the `#` part so no server (MakerLens included) receives it, and `openFromAddress()` removes it from the address bar at once. `openRemote(link)` pings `<site>/_lens/ping`, reads `/_lens/manifest` (file names and sizes) and `data/System.json` (the key), then builds lazy entries (`_resolve: () => api.file(rel)`) like a folder scan; each file is fetched with `Authorization: Bearer` (no cookies) when first shown. Only `https://*.workers.dev` is accepted, which is also the only host added to `connect-src`. The token lives in memory only. `scripts/check-site.mjs` allows `*.workers.dev` in `index.html`'s CSP only.
5. **Individual files** — the same dialog: any image or audio file(s) (`.png_`, `.ogg_`, `.rpgmvp`, `.png`…) go to `openLooseFiles()` (the key is derived from the first encrypted PNG's header).
6. **Switch to Events** — the header's Assets | Events control (`#switch-tool`, `css/switch.css`, same file as Events; phones show only the way out as one icon) is shown by `syncSwitch()` (app.js) for a game link (`S.remoteLink`, moves as the same link, `Remote.switchURL`) or an MV/MZ folder behind a directory handle (`S.folderHandle`, set after the lazy scan commits when `fs === FS_HANDLE`: picker, or a drop that gave `getAsFileSystemHandle()`). The handle goes through IndexedDB (`Handoff.send`), Events takes it out and deletes it at once; the tab is flagged in `sessionStorage['ml-handoff']`, so normal visits never open IndexedDB. If the receiving page cannot read without a click (`queryPermission` ≠ granted) it shows the start-screen card `#handoff`. **Never on the legacy GitHub Pages copy** (`SITE.isLegacy`, and `Handoff.peerURL` is null there); not offered without a handle (`<input webkitdirectory>`, archive, loose files, Firefox/Safari). `openHandoff()` is the receiving side (Events can hand a folder back). The click is counted in GoatCounter by name only (`countEvent('switch-to-events')`, which returns a Promise the handler awaits so the pixel can leave before the page navigates).

**Loading overlay:** every open action goes through `runLoad(task)` in `app.js`, which drives `Loader` (`#loader`, `css/loader.css`): named steps (`detect`/`scan`/`load`/`current` for lazy folders, `scan`/`detect`/`index` for file lists, `read`/`table`/`index` for archives), a determinate or sweeping progress bar, Cancel and an error state. Loaders build into new Maps and only `commitLibrary()` swaps them into `S` (and aborts the previous background scan), so Cancel or a failure keeps the previously open game. Long loops call `Loader.check()` (throws `AbortError` after Cancel) at their yield points.

**Feedback:** `js/feedback.js` POSTs to the shared feedback inbox `https://feedback.kokoroou.workers.dev/api/submit` (Cloudflare Worker + D1 in the private repo `Kokoroou/feedbacks`, project key `makerlens-assets`; MakerLens Events sends as `makerlens-events`) only when the user taps a star (the rating is sent at once and the Worker answers with a signed `ref` to that entry; the optional follow-up comment goes as kind `idea` with the same stars plus that `ref`, so both become one entry and ratings are not counted twice; `ref` lives in a variable only) or presses Send. The inbox keeps its projects in D1, managed with `PUT /api/projects/makerlens-assets` (service token, see the feedbacks README): they allow-list this site's origins (`https://makerlens.kokoroou.workers.dev` and the legacy `https://kokoroou.github.io`) and the `meta` fields (`opens`, `browser`); a new field or origin must be added there too, or every submit gets 403. The answered state lives in `localStorage['feedback']` (`{opens, done, skips, nextAt}`), never sent.

**ZIP download:** the toolbar's **Download ZIP** button (`#dl-folder-btn`, icon only on phones) runs `downloadFolder()` in `app.js`, which reads raw data for each entry in `S.currentFolder`, applies decryption if needed, then calls `buildZip(items)` (uncompressed/store method, pure JS CRC32 via `_CRC32` table). Output is a Blob downloaded directly in-browser.

**Supported formats:**

| Engine | Extensions | Decryption |
|--------|-----------|------------|
| MZ images | `.png_` | 16-byte header + XOR 16 bytes with key |
| MV images | `.rpgmvp` | same as above |
| MZ audio | `.ogg_`, `.m4a_` | same as above |
| MV audio | `.rpgmvo`, `.rpgmvm` | same as above |
| XP/VX | `.rgssad`, `.rgss2a` | RGSSAD v1: key `0xDEADCAFE`, cycles per entry |
| VX Ace | `.rgss3a` | RGSSAD v3: master key from archive header |
| 2000 / 2003 | `.xyz` (+ plain `.png`/`.bmp`/`.wav`/`.mid`/`.mp3`) | none; `RPG_RT.ldb`/`.lmt` at the root names the engine; `.xyz` → PNG (`js/xyz.js`); `CharSet/` gets the walk animation (rows up, right, down, left: `RM2K_SPRITE_ROWS`). Off on the legacy copy (`NEW_FEATURES`) |

**RGSSAD algorithms** (documented from `references/RPGMakerDecrypter`):
- v1 key evolution per name byte and per int: `key = (key * 7 + 3) >>> 0`
- v3 master key: `((uint32(header[8..11]) * 9) + 3) >>> 0`; file keys stored in directory
- Data decryption (both versions): XOR with key bytes, key advances every 4 bytes

**Key constants:**
- `RPG_HEADER` — `[0x52,0x50,0x47,0x4d,0x56,0,0,0,0,3,1,0,0,0,0,0]`
- `EXT_REMAP` — maps encrypted extensions to real ones (e.g. `png_` → `png`)

## References directory

`references/RPGMakerDecrypter/` contains a local clone of [uuksu/RPGMakerDecrypter](https://github.com/uuksu/RPGMakerDecrypter) (MIT, C#) kept for offline reference. It is excluded from git via `.gitignore`. Do not commit files from it; cite it in comments or docs instead.

## MakerLens redesign layer (`css/lens.css`) — legacy stays untouched

`css/lens.css` (linked after the existing CSS on all three pages) is the family's "skin": serif titles, mono labels/file names, 1px frame, the lens mark with three green pixels, 44px touch targets on phones, no text under 12px. `tokens.css` is NOT touched; layout, IDs and JS flows stay as they were. It is copied verbatim to `rpgmaker-events-viewer/css/lens.css` (like `tokens.css`), so keep it generic (shared classes `.btn-*`, `.logo-mark`, `#setup`, `#drop-zone`, toolbar, `.about-*`, `.tool-switch`), never named after one tool; edit it here and copy it over.

- **The GitHub Pages copy (`kokoroou.github.io`) deploys from these same files and must look exactly as before.** Every rule in `lens.css` sits under `:root[data-lens]` (set by `js/lens-gate.js`); only `.lens-only` / `.lens-sr` are defined outside it (both `display:none`). Never add a rule outside the gate, and never touch `js/site.js`'s banner or `deploy.yml` for the redesign. `tests/lens.test.mjs` checks the gate and that nothing else sits outside it.
- New markup is `lens-only` (hidden on legacy): the app's `<h1 class="lens-only lens-sr">MakerLens Assets</h1>` (the visible start title is an `<h2 class="lens-only">` twin of the legacy `<h1 class="lens-hide">`, so each host has exactly one h1), the second logo SVG (`#i-lens`), the static pages' header/footer and the faq's "How to use" (outside the `<details>`, so the FAQPage JSON-LD still matches).
- To check legacy is unchanged: screenshot a page with `js/lens-gate.js` routed to an empty body and compare with the same page at the base commit; pixels must match.

- **The app header (`#header`) matches the family bar** (`.top` of the MakerLens home): 56px with a 2px ink rule, the lens mark in ink at 24px with no box, the 20px serif wordmark; on phones (<= 640px) the mark only, plus the tool's name chip (the legacy "ML" abbreviation is hidden under the gate).
- **Header and footer of `faq.html` are the family's** (the same as the MakerLens home, Privacy and Legal pages): markup with `.top` / `.foot`, styled by `css/family-chrome.css` (gated by `:root[data-lens]`, like `lens.css`). It is a verbatim copy in `rpgmaker-events-viewer/css/` and mirrors `.top` / `.foot` of `Kokoroou/makerlens` `site/css/landing.css`: edit all three together. The theme button keeps `data-lens-theme` (`js/lens-static.js`).

## Which site to build for

New features target only the Cloudflare home (`https://makerlens.kokoroou.workers.dev/assets/`). The legacy GitHub Pages copy (`kokoroou.github.io/rpgmaker-assets-viewer/`) is changed only when the owner asks for it by name: no legacy-specific code, banners or workflow edits (`deploy.yml`, `js/site.js`) on our own initiative. The code is shared, so the legacy copy still receives common `js/`/`css/` changes on deploy; a feature that should not run there is gated with `SITE.isLegacy`.

## Legal constraints

- **Do not add server-side upload functionality.** All processing must stay client-side (File API only). This is a hard constraint for DMCA safety — the tool must never receive or store user game files on a server.
- **Do not distribute or embed actual game assets** (images, audio, scripts from any RPG Maker game) in this repository, even as test fixtures, without explicit rights.
- When extending decryption to new formats, document the format source (spec, reference implementation) in a code comment.
- **`privacy.html` states principles, not mechanisms** (files stay on the device, what the counter and the feedback form may send, how to reach the owner). Keep it short and do not list fields, storage keys or timings there: they live in the code and in this file. Update the page only when a principle changes (a new kind of data leaves the device, a new third party); the anchors `#files`, `#analytics`, `#feedback`, `#hosting` are linked from both tools.
- **Analytics must never include user file data.** `js/analytics.js` may send only the page path, referrer and the traffic-source query params listed in `SOURCE_PARAMS`, plus the fixed event names in `EVENTS` through `countEvent()` (call `track(name)`, constants.js): how a game was opened (`open-picker`/`-drop`/`-input`/`-archive`/`-files`/`-link`/`-handoff`, passed as `runLoad(task, way)`), the outcome (`open-ok`/`-cancel`/`-fail-nomedia` via `noMediaError()`/`-fail-other`), `picker-unsupported`, the engine family (`engineEvent()` of the label given to `noteEngine()`), features (`lightbox-image`/`-audio`, `sprite-anim`, `filter-used`, `dupes-on`, `search-used`), the feedback card and `switch-to-events`. Each name is sent at most once per page load. Each name goes out with the page code first (`as-open-ok`; MakerLens Events sends `ev-…`), set once as `PAGE` in `analytics.js`: never pass the prefix to `track()`, and keep the prefix when adding a name to Events' list. A new name must be a fixed string about a way, an outcome or a feature, never built from a file, a game or what was typed; add it to `EVENTS` (`tests/analytics.test.mjs` fails otherwise) and to MakerLens Events' list if both tools count it. No download counts (Download ZIP, single files): they read as "how much was extracted". Never send file/folder names, game titles, keys, or contents — knowing what users open would undermine the DMCA position in `LEGAL.md`. No cookies or storage-based identifiers (they would require a consent banner). `privacy.html#analytics` describes these kinds of actions in words; change it only for a new kind.
- **Feedback must never include user file data.** `js/feedback.js` may send only `project`, `kind`, `rating`, `comment`, `lang` and `ref` (the opaque pointer the Worker returned for the star just sent, memory only), `meta.opens` (bucket) / `meta.browser` (bug reports only, shown as a chip the user can remove); the inbox Worker validates exactly these and must not store IP, user agent, headers or any identifier (only the day). The automatic prompt stays off with Do Not Track / GPC and on local copies. Update `privacy.html#feedback` only if the kind of data changes.
- **Content-Security-Policy** is set by a `<meta>` tag in `index.html`, `privacy.html` and `faq.html`. Do not add external hosts to it beyond the GoatCounter endpoint and, in `index.html`'s `connect-src` only, the feedback inbox (`feedback.kokoroou.workers.dev`) and `https://*.workers.dev` (game links); `scripts/check-site.mjs` enforces this. If you edit the inline theme script in `<head>`, recompute its `sha256` hash in the CSP of all three pages or the script will be blocked.
- **Folder picker:** `pickFolder()` in `app.js` prefers `showDirectoryPicker` (Chrome/Edge prompt says "view files") and falls back to `<input webkitdirectory>` (Chrome's prompt for it says "upload", which contradicts the privacy promise).

- **Page titles** follow the family format `{Topic} — {Qualifier} | MakerLens` (about 60 chars, `og:title`/`twitter:title` identical): see the Page titles section of `Kokoroou/makerlens` CLAUDE.md.

## Releases

`.github/workflows/release.yml` (release-please, via agent-toolkit's shared `release.yml@v0`, same as rpgmaker-web-toolkit) keeps a `chore(main): release X.Y.Z` PR up to date from the Conventional Commits on `main` (`feat:` → minor, `fix:` → patch, `feat!:` → major; `docs:` `ci:` `chore:` `refactor:` `test:` alone make no release). Merging it tags `vX.Y.Z` and creates the GitHub Release; nothing is attached (the site is deployed by makerlens' `deploy.yml`). The first release is `v1.0.0` (`initial-version`). So squash-merge PRs with a Conventional Commit title, and never edit `CHANGELOG.md` or `version.txt` by hand.

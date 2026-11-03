# Roadmap

Direction for MakerLens, drawn from cross-checking the
[awesome-game-file-format-reversing](https://github.com/VelocityRa/awesome-game-file-format-reversing)
list (the RPG Maker section and the general asset viewers). The projects
mentioned were only read through their one-line descriptions in that list;
**read the real source before imitating any of their algorithms**, and record
the format source in a code comment (see CLAUDE.md).

Ground rules, unchanged:

- 100% client-side, no upload, no key storage (see `LEGAL.md`).
- No dependencies, no build step; everything runs by opening `index.html`.
- Analytics never contain file data.
- What sets MakerLens apart from most tools in this space (CLI/desktop): it runs
  in the browser with no install. Every item below must preserve that.

Effort: **S** (≤ 1 day), **M** (a few days), **L** (more than a week).

---

## 1. Do first (high priority)

Large impact, small effort, within the current scope.

| # | Item | Why | Effort |
|---|------|-----|--------|
| 1 ✅ | **Derive the key from the known PNG header** when `System.json` is missing, broken or altered | After the first 16 bytes, an `.rpgmvp` / `.png_` header is 16 known PNG bytes (signature + IHDR chunk), so XOR-ing back yields the key. Done: `deriveKeyFromPNG()` (images only; audio reuses the derived key). The key still lives only in memory | S |
| 2 ✅ | **Open loose files** (drop a few `.rpgmvp` / `.png_` / `.rpgmvo`...) | Needs item 1 to work without `System.json`. For audio, try the key derived from images, or the known OggS header | S–M |
| 3 ✅ | **Per-file error reporting, without aborting the whole open** (corrupt archive, truncated file, wrong header) | Errors used to break the whole flow. List what is readable, mark bad files and say why | S–M |
| 4 ✅ | **More tests for bad input**: wrong RGSSAD header, offset/size beyond the file, file names with `..` or odd characters, long loops | More reliability, and blocks path traversal on ZIP export. Fixtures are still built inside the tests, never real assets | S |
| 5 ✅ | **Validate file names on ZIP export** (drop `..`, absolute paths, characters forbidden on Windows, names that collide after the extension changes) | Input archives are untrusted data; entry names go straight into the ZIP | S |

## 2. Do next

Features RPG Maker users actually need, following the engine's own conventions.

| # | Item | Notes | Effort |
|---|------|-------|--------|
| 6 ✅ | **Grid-sliced sprites and a walking animation** for character sheets | Naming convention: a `$` prefix is a single character (3×4 frames), no `$` is an 8-character sheet (12×8); `!` is an object that is not shifted half a tile. Cells are 48×48 (MV/MZ) or 32×32 (VX/VX Ace, customizable). Done: `js/sprite.js`; images under a `characters/` folder get a walk-animation toggle with character and direction pickers in the lightbox (cell size derived from the image size) | M |
| 7 ✅ | **Show audio loop points** (`LOOPSTART`, `LOOPLENGTH` in the OGG Vorbis comment) and loop at the right point | RPG Maker MV/MZ uses these tags. Only the OGG comment packet needs reading, no separate decoder. Done: `parseOggLoop()` in `js/audio-loop.js`; the lightbox shows the loop and a "loop at points" toggle (rAF-based seek, so accurate to a frame, not sample-exact) | M |
| 8 ✅ | **Group files with identical content** (SHA-256 via `crypto.subtle`) and an "unique only" filter | Useful for games that duplicate assets. Hash after decryption, in the background, without disturbing the user's read priority (`Fg.active`). Done: `js/dupes.js`; the toolbar "Unique only" toggle starts hashing (folder on screen first, paused while `Fg.active`), hides later copies in each folder and in the ZIP, badges copies `×N` and adds a virtual "Duplicates" sidebar folder | M |
| 9 ✅ | **Document the formats with Kaitai Struct (`.ksy`)** for `.rpgmvp` and RGSSAD v1/v3 in `docs/formats/` | Adds no dependency to the app. Lets others verify and reuse, and matches the "record the format source" rule. Done: `docs/formats/*.ksy` (illustrative, not compiled in CI) | S–M |
| 10 | **Better search**: filter by type, image size, audio length | The data is already in the thumbnails and audio metadata | S–M |

## 3. Maybe (weigh against real demand)

Reasonable, but needs confirmation that real users want it, or widens the scope considerably.

| # | Item | Notes | Effort |
|---|------|-------|--------|
| 11 | **RPG Maker 2000/2003**: open a bare game folder, view PNG/WAV/MIDI, decode `.xyz` images | `.xyz` is a zlib stream plus a palette; browsers have `DecompressionStream('deflate')`, so no library is needed. See the descriptions in `libxyzimage` / `xyz2png`. Small format, low risk | M |
| 12 | **Pre-assembled tileset view (A1–A5, B–E)** that tells autotiles apart | Requires understanding each type's layout; display only, no map building | M |
| 13 | **Ren'Py `.rpa`** (RPA-2.0/3.0) | The index is a zlib-compressed pickle; a minimal, safe pickle reader (executing nothing) would have to be written. Opens the door to the visual-novel community but strays from the "RPG Maker" brand | L |
| 14 | **Wolf RPG archives** | `rpga` can extract them; several encryption variants exist. Only if there is a clear request and trustworthy format documentation | L |
| 15 | **Detect and clearly report games with custom encryption** (decryption plugins, altered headers) | Say "not supported because ..." instead of failing silently. Do not try to break plugins | S–M |
| 16 | **PWA / offline** (service worker) | Fits the privacy promise, but needs a CSP update and a change to the deploy "Assemble site" step | M |
| 17 | **Cross-link with LoreInsight** (event flow ↔ asset viewing) | Only a link / guide, no data shared between the two sites | S |
| 18 | **ZIP compression (deflate)** with `CompressionStream` instead of "store" only | Smaller downloads; CRC must be computed for the compressed data as it is today. Limited gain because PNG/OGG are already compressed | S–M |

## 4. Do not do

Against the project's ground rules, legally risky, or not worth the benefit.

| Item | Reason |
|------|--------|
| **Any server-side upload or sync** (including "share link", saving the library to the cloud, OCR/translation that calls an API with file content) | Violates the DMCA constraint in `LEGAL.md` and the privacy promise |
| **Bundling or embedding real game assets** (sample images, demo audio, fixtures from real games) | Same legal reason; tests always use synthetic bytes |
| **Storing decryption keys or game/folder names** in localStorage, cookies or analytics | Keys stay in memory only; analytics must not know what users open. Also avoids needing a consent banner |
| **Detailed analytics** (file counts, engine type, game size, errors with file names) | Even anonymous, they weaken the legal argument. For diagnosing errors, show them on the user's machine and let them copy them themselves |
| **Loading or calling third-party hosts** (CDN, fonts, libraries) | The CSP allows only the GoatCounter endpoint (and the feedback inbox); stay dependency-free |
| **Adding a build step, bundler, framework or package manager** | Loses the "open `index.html` and it runs" advantage and makes the code harder to verify |
| **Editing or repackaging games** (re-encrypt, rebuild a project, patch a game, bypass copy protection) | Leaves the "view and extract" role and raises legal risk; other tools already do it better (RPG Maker Decrypter, Petschko) |
| **Breaking the DRM/encryption of plugins or third-party protectors** | Outside the engine's standard formats; legal risk |
| **Text conversion/translation, map editors, save editors, engine emulation** | Different products (rpgmtranslate, Luminol, EasyRPG, mkxp...). Not worth duplicating the effort |
| **Rewriting in WebAssembly/Rust just for speed** | Decryption is a 16-byte XOR; the bottleneck is disk I/O and image decoding, not CPU |
| **Expanding to dozens of engines/formats like QuickBMS/GARbro/AssetStudio** | Those tools are specialized and mature; MakerLens wins on focus and ease of use |

---

## Suggested order

1. Items 1 → 5 (robustness). Done: 1–5 (loose files: drop `.rpgmvp` / `.png_` / `.rpgmvo`... onto the page, the key is derived from the first image; `downloadFolder()` lists skipped files and why). Also done: 6, 7, 8 and 9. Next: item 10.
2. Items 6 and 7 (sprites and loop points: the most visible differentiators).
3. Item 9 (`.ksy` documentation) in parallel, independent of the code.
4. Item 11 (RPG Maker 2000/2003) if users ask for it.
5. Re-evaluate the rest after each release.

## How to pick new work

A task is worth doing when: (a) it stays 100% client-side with no dependencies,
(b) it needs nothing sent to a server, (c) there is documentation or a
reference implementation to cite, and (d) it can be tested with synthetic
bytes. If one of the four is missing, move it to section 4 or discuss it first.

---

## References and acknowledgements

Source list: [awesome-game-file-format-reversing](https://github.com/VelocityRa/awesome-game-file-format-reversing)
([web version](https://velocityra.github.io/awesome-game-file-format-reversing/)).
The projects below were **identified from their descriptions in that list**; when
using their logic, read the real source, check the license, rewrite it in our
own way and cite the source in a code comment (CLAUDE.md: "document the format
source"). The "Used for" column points back to the item numbers above.

### RPG Maker MV/MZ (`.rpgmvp`, `.png_`, `.rpgmvo`, `.ogg_`...)

| Project | Used for |
|---------|----------|
| [uuksu/RPGMakerDecrypter](https://github.com/uuksu/RPGMakerDecrypter) (MIT; local copy in `references/`) | Main source of the RGSSAD and MV/MZ algorithms |
| [RPG-Maker-Translation-Tools/rpgm-asset-decrypter-rs](https://github.com/RPG-Maker-Translation-Tools/rpgm-asset-decrypter-rs) and [rpgm-asset-decrypter-lib](https://github.com/RPG-Maker-Translation-Tools/rpgm-asset-decrypter-lib) | Items 1–2: deriving the key when `System.json` is missing |
| [Petschko/RPG-Maker-MV-Decrypter](https://gitlab.com/Petschko/RPG-Maker-MV-Decrypter) | Items 1–2, 15: key and header handling (plus the [old GitHub copy, read-only](https://github.com/Petschko/RPG-Maker-MV-Decrypter)) |
| [Bioruebe/rmvdec](https://github.com/Bioruebe/rmvdec) | Item 2: decrypting loose files |
| [RPG-Maker-Translation-Tools/rpgmdec](https://github.com/RPG-Maker-Translation-Tools/rpgmdec) | Item 3: checking assets after decryption |
| [TTitanUA/rpg-game-decrypter-python](https://github.com/TTitanUA/rpg-game-decrypter-python) | Reference for the MV/MZ decryption flow in a GUI |

### RPG Maker XP / VX / VX Ace (RGSSAD)

| Project | Used for |
|---------|----------|
| [luxrck/rgssad](https://github.com/luxrck/rgssad) | Cross-checking v1/v3 |
| [usagirei/RGSS-Decryptor](https://github.com/usagirei/RGSS-Decryptor) ([Bioruebe's fork](https://github.com/Bioruebe/RGSS-Decryptor)) | Cross-checking v1/v3 |
| [RPG-Maker-Translation-Tools/rpgm-archive-decrypter](https://github.com/RPG-Maker-Translation-Tools/rpgm-archive-decrypter) and [rpgm-archive-decrypter-lib](https://github.com/RPG-Maker-Translation-Tools/rpgm-archive-decrypter-lib) | Items 3–4: handling corrupt archives |
| [elizagamedev/rpga](https://github.com/elizagamedev/rpga) | Item 14: Wolf RPG archives |
| [dogtopus/rgssad-fuse](https://github.com/dogtopus/rgssad-fuse) | Lazy per-entry reads, avoiding loading the whole archive |
| [Ancurio/mkxp](https://github.com/Ancurio/mkxp) ([mkxp-z](https://github.com/mkxp-z/mkxp-z)) | RGSS behavior when reading archives |

### RPG Maker 2000/2003 and older versions

| Project | Used for |
|---------|----------|
| [Ghabry/libxyzimage](https://github.com/Ghabry/libxyzimage) | Item 11: `.xyz` images |
| [vn-tools/xyz2png](https://github.com/vn-tools/xyz2png) (merged into [arc_unpacker](https://github.com/vn-tools/arc_unpacker)) | Item 11: `.xyz` images |
| [EasyRPG/liblcf](https://github.com/EasyRPG/liblcf), [EasyRPG/Player](https://github.com/EasyRPG/Player), [EasyRPG/Tools](https://github.com/EasyRPG/Tools) | Items 11–12: the LCF format, map rendering |
| [Ghabry/rpg95-fileformat](https://github.com/Ghabry/rpg95-fileformat) | RPG Maker 95 format documentation |
| [florianessl/lucifer-file-carver](https://github.com/florianessl/lucifer-file-carver) | Item 3: tolerating corrupt data |

### Audio, sprites, detection

| Project | Used for |
|---------|----------|
| [Splendide-Imaginarius/crosslooper](https://github.com/Splendide-Imaginarius/crosslooper) | Item 7: the `LOOPSTART` / `LOOPLENGTH` convention |
| [MeguminBOT/TextureAtlas-Toolbox](https://github.com/MeguminBOT/TextureAtlas-Toolbox) | Item 6: slicing sprite sheets |
| [BoBoBaSs84/DDS.Tools](https://github.com/BoBoBaSs84/DDS.Tools) | Item 8: duplicate detection |

### Format documentation and analysis tools

| Project | Used for |
|---------|----------|
| [Kaitai Struct](https://kaitai.io/) ([source](https://github.com/kaitai-io/kaitai_struct)) | Item 9: `.ksy` descriptions |
| [pytai](https://github.com/Dvd848/pytai) | Checking `.ksy` structure against sample data |
| [palimpsest](https://github.com/kenrinzero/palimpsest) | Catalog of container headers, reference for format detection |

### Product models (viewers that run in the browser)

| Project | Idea |
|---------|------|
| [magcius/noclip.website](https://github.com/magcius/noclip.website) | A game viewer running entirely in the browser |
| [Kokoroou/lore-insight](https://github.com/Kokoroou/lore-insight) | Item 17: a tool by the same author with the same offline principles |
| [steffest/DPaint-js](https://github.com/steffest/DPaint-js) | Example of an old format read in pure JavaScript |
| [InvoxiPlayGames/stfs-webjs](https://github.com/InvoxiPlayGames/stfs-webjs) | Example of reading a binary container in the browser |

### Out of scope (for awareness only, see section 4)

[Luminol](https://github.com/Astrabit-ST/Luminol),
[rpgmtranslate-qt](https://github.com/RPG-Maker-Translation-Tools/rpgmtranslate-qt),
[rvpacker-txt-rs](https://github.com/RPG-Maker-Translation-Tools/rvpacker-txt-rs),
[rpgsave-converter](https://github.com/13xforever/rpgsave-converter).

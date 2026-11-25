# MakerLens Assets

See and save the images and audio of an RPG Maker game, right in your browser. Supports **2000, 2003, XP, VX, VX Ace, MV and MZ**. Everything runs on your device: your game files and keys are never uploaded.

**[Try it live →](https://makerlens.kokoroou.workers.dev/assets/)**

**Who it's for:** modders and translators working with permission, developers and artists recovering their own work, and anyone who wants to look at a game's images and music without installing unknown software. Free, no account, no ads. Part of the [MakerLens](https://makerlens.kokoroou.workers.dev/) family: to read the same game's dialogue, choices and switches, use [MakerLens Events](https://makerlens.kokoroou.workers.dev/events/).

<video src="https://github.com/user-attachments/assets/aa643c3b-81a1-4a13-936a-ebf4ea69e886" controls width="100%"></video>

## Features

- **Zero install, no build** — open the site, or `index.html` locally, in any modern browser
- **Local-only processing** — files are read with the browser File API; no file or key is ever uploaded
- **Automatic key handling** — reads `encryptionKey` from `data/System.json`; if that is missing or broken, recovers the key from a known PNG header (kept in memory only)
- **Folders, archives and loose files** — pick or drop a game folder; or, under **View another way**, open an `.rgssad` / `.rgss2a` / `.rgss3a` archive on its own, individual files, or a game link
- **Fast on big games** — folders are scanned lazily in the background; thumbnails load on demand
- **Image and audio preview** — grid, lightbox with keyboard navigation and, on phones, swipe / pinch gestures with a bottom control bar, in-browser audio player
- **Export** — download one asset from its preview, or every file shown in the current folder (after search, filters and Unique only) with **Download ZIP**; files that cannot be read are listed, not silently dropped
- **Duplicate finder** — the "Unique only" switch on the sidebar's Duplicates row hides files with identical content (SHA-256 of the decrypted bytes, computed in the browser); copies are badged and grouped in a Duplicates folder
- **Search and filters** — by name, by type (images / audio), image width and height (with presets such as 48×48 tiles), and audio length; sizes and lengths are read from file headers only
- **Adjustable tiles, light/dark theme**

## Getting started

1. Open **[MakerLens Assets](https://makerlens.kokoroou.workers.dev/assets/)**.
2. Click **Select Game Folder** (or drop the folder anywhere on the page) and pick the game's **main folder: the one with `Game.exe` in it** (`RPG_RT.exe` for 2000/2003). That works for every version: MV keeps its files in `www/`, MZ in `img/` and `audio/`, VX Ace / VX / XP in `Game.rgss3a` (or `.rgss2a`, `.rgssad`) next to `Game.exe`, 2000/2003 in folders such as `Picture/` and `Music/`, and the viewer finds them.
3. The pictures folder opens first. Pick other folders in the sidebar, click a file to preview it (its download button saves that one file), or press **Download ZIP** to save every file shown in that folder (not its subfolders; search, filters and Unique only decide what is shown).

**Picked the wrong folder?** If it holds no images or audio (for example `data/`), the viewer says so, names the folder and stays on the start screen: pick the folder above it. A media folder such as `img/` opens, but shows only what is inside it.

**Other ways in** (the **View another way** button): an archive file on its own, individual files such as `.png_` or `.rpgmvp`, or a link made in a game published with rpgmaker-web-toolkit.

**Browsers:** desktop Chrome, Edge, Firefox and Brave work best. On a phone, folder selection may not be offered; individual files (View another way) still work, and the viewer adapts to the small screen. More help (where the key is, offline use): [FAQ](https://makerlens.kokoroou.workers.dev/assets/faq.html).

## Supported formats

| Engine | Files | Decryption |
|--------|-------|------------|
| XP / VX | `.rgssad`, `.rgss2a` (RGSSAD v1) | key embedded in the archive |
| VX Ace | `.rgss3a` (RGSSAD v3) | per-file keys embedded in the archive |
| MV | `.rpgmvp` (image), `.rpgmvo` / `.rpgmvm` (audio) | 16-byte XOR with the key from `System.json` |
| MZ | `.png_` (image), `.ogg_` / `.m4a_` (audio) | same with the same key |
| Any | `.png` `.jpg` `.gif` `.webp` `.bmp` `.ogg` `.m4a` `.mp3` `.wav` | none, shown as is (typed by their bytes, so a WebP saved as `.png_` still shows and downloads as `.webp`) |
| XP / VX / 2000 / 2003 | `.mid` | listed and downloaded; browsers cannot play MIDI |
| 2000 / 2003 | `.xyz` (image) | none: zlib-compressed 256-colour image, shown and saved as an indexed PNG (`js/xyz.js`) |

Algorithms and their sources are documented in the code comments (`js/decrypt-*.js`).

## Privacy and legal

- **Privacy:** your files and keys are processed only in your browser; nothing about them is sent anywhere. The public site does send two things: an anonymous count of page visits and of a few actions by name (GoatCounter: how a game was opened, which feature was used, never what), and feedback only when you choose to send it. What is sent, and what never is, is defined in [`privacy.html`](https://makerlens.kokoroou.workers.dev/assets/privacy.html), the single source of truth. A Content-Security-Policy makes the browser block every other host.
- **Legal:** intended for your own assets or work done with the rights holder's permission. See [`LEGAL.md`](LEGAL.md) for intended use, user responsibility and takedown policy.

## Documentation

| Document | What it covers |
|----------|----------------|
| [`privacy.html`](privacy.html) | what the site sends, and what never leaves your device |
| [`LEGAL.md`](LEGAL.md) | intended use, user responsibility, DMCA / takedown |
| [`faq.html`](faq.html) | usage questions |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | planned work, non-goals, reference projects |
| [`docs/benchmarks/`](docs/benchmarks/traverse-handle.md) | folder-scan performance measurements |
| [`CLAUDE.md`](CLAUDE.md) | architecture and contributor rules |

## Contributing

Pull requests are welcome; for significant changes, open an issue first. Before opening a PR, run the CI checks (Node 22+, no install needed):

```bash
node scripts/check-site.mjs && node --test "tests/*.test.mjs"
```

Please do **not** commit real game assets or encryption keys, even as test fixtures, without permission from the copyright holder. If you change what the site sends, update `privacy.html` in the same PR.

## Acknowledgments

[**RPGMakerDecrypter**](https://github.com/uuksu/RPGMakerDecrypter) by Mikko Uuksulainen (MIT) is the reference implementation for the decryption algorithms; its author explicitly welcomed web UIs built on it. More projects are credited in the [roadmap](docs/ROADMAP.md#references-and-acknowledgements).

## License

MIT © 2026 Trương Tuấn Anh — see [LICENSE](LICENSE).

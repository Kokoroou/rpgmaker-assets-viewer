# MakerLens

A browser-based media viewer for RPG Maker games. Supports **MV, MZ, XP, VX, and VX Ace**. Runs entirely client-side — no server, no uploads, no data leaves your machine.

---

## Table of Contents

- [Demo](#demo)
- [Features](#features)
- [Supported Formats](#supported-formats)
- [Getting Started](#getting-started)
  - [RPG Maker MV / MZ](#rpg-maker-mv--mz)
  - [RPG Maker XP / VX / VX Ace](#rpg-maker-xp--vx--vx-ace)
- [Project Structure](#project-structure)
- [Legal Notice](#legal-notice)
- [Roadmap](#roadmap)
- [Acknowledgments](#acknowledgments)
- [Contributing](#contributing)
- [License](#license)

---

## Demo

<video src="screenshots/instruction.mp4" controls width="100%"></video>

---

## Features

- **Zero-install** — open `index.html` directly in any modern browser
- **Local-only processing** — files are read via the browser File API; nothing is uploaded or transmitted
- **Auto key extraction** — reads `encryptionKey` from `data/System.json` automatically (MV/MZ)
- **RGSSAD archive support** — load `.rgssad` / `.rgss2a` / `.rgss3a` archives directly (XP/VX/VX Ace)
- **Audio preview** — plays decrypted `.ogg_`, `.m4a_`, `.rpgmvo`, `.rpgmvm` files in-browser
- **Folder browser** — sidebar groups assets by sub-folder with an expandable tree
- **Lazy-loaded grid** — renders thumbnails on demand; handles large directories without freezing
- **Lightbox viewer** — full-resolution image preview or audio player with keyboard navigation (`←` / `→` / `Esc`)
- **Download individual** — save any decrypted asset to disk from the lightbox
- **Download folder** — export all files in the current folder as a `.zip` (no-dependency, in-browser ZIP builder)
- **Search** — real-time filename filter
- **Adjustable tile size** — slider from 70 px to 280 px
- **Resizable sidebar** — drag the sidebar edge; preference persisted to `localStorage`
- **Light / dark theme** — toggle in the header; preference persisted

---

## Supported Formats

### RPG Maker MV / MZ — pick `img/` folder

| Extension | Type | Notes |
|-----------|------|-------|
| `.rpgmvp` | Image (MV) | Decrypted in-browser using key from `System.json` |
| `.png_` | Image (MZ) | Same |
| `.rpgmvo` | Audio (MV) | OGG, decrypted in-browser |
| `.rpgmvm` | Audio (MV) | M4A, decrypted in-browser |
| `.ogg_` | Audio (MZ) | OGG, decrypted in-browser |
| `.m4a_` | Audio (MZ) | M4A, decrypted in-browser |
| `.png`, `.jpg`, `.gif`, `.webp`, `.bmp` | Image | Displayed directly |
| `.ogg`, `.m4a` | Audio | Played directly |

### RPG Maker XP / VX / VX Ace — pick archive file

| File | Engine | Notes |
|------|--------|-------|
| `Game.rgssad` | XP | RGSSAD v1, key `0xDEADCAFE` |
| `Game.rgss2a` | VX | RGSSAD v1, same algorithm |
| `Game.rgss3a` | VX Ace | RGSSAD v3, per-file keys |

No encryption key needed — keys are embedded in the archive.

---

## Getting Started

### RPG Maker MV / MZ

1. Clone or download this repository.
2. Open `index.html` in a Chromium-based browser (Chrome, Edge, Brave) or Firefox.
3. Click **Select Game Folder** and pick the game's root directory.
   - The encryption key is auto-detected from `data/System.json`.
   - All decrypted images and audio appear in the sidebar tree.
4. Browse folders, search by filename, click an asset to preview it, or use **Download folder** in the toolbar to export the whole folder as a `.zip`.

### RPG Maker XP / VX / VX Ace

1. Open `index.html` in a browser.
2. Click **Select archive** and pick `Game.rgssad`, `Game.rgss2a`, or `Game.rgss3a`.
   - No key entry needed — keys are embedded in the archive.
3. Browse, search, preview, and download assets.

> **Browser compatibility:** Folder selection (`webkitdirectory`) is supported by all major desktop browsers. Mobile browsers may not support it.

---

## Project Structure

```
rpg-maker-decrypter-ui/
├── index.html            # HTML structure
├── css/
│   ├── style.css         # Imports all modules
│   ├── tokens.css        # Design tokens (colors, radii, etc.)
│   ├── base.css          # Reset, body, scrollbars
│   ├── layout.css        # Header, sidebar, buttons, About modal
│   ├── setup.css         # Landing/setup screen
│   ├── grid.css          # Toolbar, grid, cards, lightbox styles
│   └── lightbox.css      # Lightbox overlay
├── js/
│   ├── constants.js      # Extension regexes, MIME types, EXT_REMAP
│   ├── state.js          # Global state object S
│   ├── decrypt-mvmz.js   # MV/MZ XOR decryption
│   ├── decrypt-rgssad.js # RGSSAD v1/v3 archive parser
│   ├── ui.js             # Rendering, sidebar tree, lightbox, download
│   └── app.js            # Event handlers, loading logic, ZIP writer
├── LEGAL.md
├── LICENSE
├── README.md
└── references/           # Local reference code (not committed — see .gitignore)
    └── RPGMakerDecrypter/    # Reference: uuksu/RPGMakerDecrypter (MIT)
```

---

## Legal Notice

See [LEGAL.md](LEGAL.md) for full details on intended use, user responsibility, and DMCA/takedown policy.

**Summary:** This tool reads only files you explicitly select from your local machine. No data is uploaded or stored. It is intended for developers, artists, and researchers working with their own assets or with explicit permission.

---

## Roadmap

- [x] RPG Maker MV image support (`.rpgmvp`)
- [x] RPG Maker MV/MZ audio preview (`.ogg_`, `.m4a_`, `.rpgmvo`, `.rpgmvm`)
- [x] RPG Maker XP / VX / VX Ace RGSSAD archive support (`.rgssad`, `.rgss2a`, `.rgss3a`)
- [x] Download decrypted assets from lightbox
- [x] Batch export — download current folder as `.zip` (no-dependency, in-browser ZIP builder)
- [x] Expandable sidebar folder tree with resizable panel
- [x] Light / dark theme toggle
- [x] Drag-and-drop folder / archive loading
- [x] Audio duration display in lightbox

---

## Acknowledgments

- [**RPGMakerDecrypter**](https://github.com/uuksu/RPGMakerDecrypter) by Mikko Uuksulainen — MIT licensed CLI reference implementation for RPG Maker XP/VX/MV/MZ decryption. The original author explicitly invited the creation of web UIs and cross-platform tools built on this work (see CHANGELOG v3.0.0).

---

## Contributing

Pull requests are welcome. For significant changes, open an issue first to discuss scope and approach.

Please do **not** commit actual game assets or encryption keys — even as test fixtures — without explicit permission from the relevant copyright holder.

---

## License

MIT © 2026 Trương Tuấn Anh — see [LICENSE](LICENSE).

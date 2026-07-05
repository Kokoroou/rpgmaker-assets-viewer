# MakerLens

A browser-based media viewer for RPG Maker games. Supports **MV, MZ, XP, VX, and VX Ace**. Runs entirely client-side — no server, no uploads, no data leaves your machine.

**[Try it live →](https://kokoroou.github.io/rpgmaker-assets-viewer/)**

---

## Table of Contents

- [Demo](#demo)
- [Features](#features)
- [Supported Formats](#supported-formats)
- [Getting Started](#getting-started)
- [Legal Notice](#legal-notice)
- [Acknowledgments](#acknowledgments)
- [Contributing](#contributing)
- [License](#license)

---

## Demo

<video src="https://github.com/user-attachments/assets/7052b8a7-eaa2-4967-b902-c6f60342d6c5" controls width="100%"></video>

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

### RPG Maker MV / MZ

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

### RPG Maker XP / VX / VX Ace

| File | Engine | Notes |
|------|--------|-------|
| `Game.rgssad` | XP | RGSSAD v1, key `0xDEADCAFE` |
| `Game.rgss2a` | VX | RGSSAD v1, same algorithm |
| `Game.rgss3a` | VX Ace | RGSSAD v3, per-file keys |

No encryption key needed — keys are embedded in the archive. Select the game folder or the archive file directly.

---

## Getting Started

**No installation needed** — open **[MakerLens](https://kokoroou.github.io/rpgmaker-assets-viewer/)** directly in your browser.

1. Go to **[kokoroou.github.io/rpgmaker-assets-viewer](https://kokoroou.github.io/rpgmaker-assets-viewer/)** (or open `index.html` locally).
2. Click **Select Game Folder** and pick the game's root directory.
   - **MV / MZ:** The encryption key is auto-detected from `data/System.json` — no manual entry needed.
   - **XP / VX / VX Ace:** The archive (`Game.rgssad`, `.rgss2a`, `.rgss3a`) is auto-detected inside the folder. You can also click **Select archive** to load it directly.
3. Browse folders, search by filename, click an asset to preview it, or use **Download folder** to export the current folder as a `.zip`.

> **Browser compatibility:** Works in all major desktop browsers (Chrome, Edge, Firefox, Brave). Mobile browsers may not support folder selection.

---

## Legal Notice

See [LEGAL.md](LEGAL.md) for full details on intended use, user responsibility, and DMCA/takedown policy.

**Summary:** This tool reads only files you explicitly select from your local machine. No data is uploaded or stored. It is intended for developers, artists, and researchers working with their own assets or with explicit permission.

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

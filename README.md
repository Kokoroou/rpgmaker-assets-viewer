# MakerLens

A browser-based media viewer for RPG Maker games. Supports **MV, MZ, XP, VX, and VX Ace**. Runs entirely client-side — no server, no uploads, no data leaves your machine.

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
├── LICENSE
├── README.md
└── references/           # Local reference code (not committed — see .gitignore)
    └── RPGMakerDecrypter/    # Reference: uuksu/RPGMakerDecrypter (MIT)
```

---

## Legal Notice

This section exists to be explicit about what this tool does and does not do, and to reduce the risk of DMCA or similar complaints for contributors and users.

### What the tool does (technically)

**RPG Maker MV/MZ:** The engine stores an XOR obfuscation key in **plaintext** inside `data/System.json`, which ships with every game deployment. Encrypted files (`.rpgmvp`, `.png_`, `.rpgmvo`, `.ogg_`, etc.) have their first 16 bytes XOR-ed with the key and a 16-byte RPG Maker header prepended. This tool reads `System.json` from the user's local filesystem to obtain the key, reverses the XOR entirely inside the browser's memory, and renders the result via a temporary Blob URL.

**RPG Maker XP/VX/VX Ace:** Assets are packed into a single archive file (`.rgssad`, `.rgss2a`, `.rgss3a`). The decryption key is **embedded in the archive itself** — not distributed separately. This tool parses the archive binary, decrypts each file using the embedded key, and renders the result in-browser.

In both cases, the tool:
- **Reads only files the user explicitly selects** from their local filesystem.
- **Never uploads, stores, or transmits any file or key to a remote server.**

Because the keys are co-located with (or embedded in) the content they "protect", this obfuscation is not considered effective access control under most legal interpretations, and is substantially different from true DRM systems (e.g., commercial encryption schemes where the key is not distributed with the content).

### Intended use

This tool is intended for:

- **Game developers** working on their own RPG Maker projects who need to inspect or recover their own assets.
- **Artists and contributors** who created assets for a game and need to review or retrieve their own work.
- **Modders** operating under explicit permission from the game's copyright holder.
- **Researchers and educators** studying file formats or game development workflows.

### What this tool is NOT for

- Extracting, distributing, or repurposing assets from games you do not own or have not received explicit permission to modify.
- Circumventing access controls on commercially distributed games without authorization.
- Any use that violates the End User License Agreement of the game or the RPG Maker engine.

### User responsibility

By using this tool, you accept that:

1. You are responsible for ensuring you have the legal right to access and process the files you select.
2. This tool does not grant you any rights over third-party copyrighted content.
3. The authors of this tool are not liable for how you use the output.

Game assets (images, audio, scripts) distributed with a game are protected by copyright regardless of whether they are obfuscated. Decrypting them for personal inspection does not create a license to redistribute them.

### RPG Maker EULA

Kadokawa / Gotcha Gotcha Games publish separate EULAs for each RPG Maker version. Consult the EULA that applies to the specific game you are working with. Common restrictions include limitations on asset redistribution and derivative works.

### DMCA / takedown

If you are a rights holder and believe this tool is being used to infringe your copyright, please open an issue or contact the maintainer directly. We will respond promptly. Note that a takedown request directed at this repository must target the tool itself, not individual users' actions, which are outside this project's control.

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

## Acknowledgments

- [**RPGMakerDecrypter**](https://github.com/uuksu/RPGMakerDecrypter) by Mikko Uuksulainen — MIT licensed CLI reference implementation for RPG Maker XP/VX/MV/MZ decryption. The original author explicitly invited the creation of web UIs and cross-platform tools built on this work (see CHANGELOG v3.0.0).

## Contributing

Pull requests are welcome. For significant changes, open an issue first to discuss scope and approach.

Please do **not** commit actual game assets or encryption keys — even as test fixtures — without explicit permission from the relevant copyright holder.

## License

MIT © 2026 Trương Tuấn Anh — see [LICENSE](LICENSE).

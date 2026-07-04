# SpriteVault

A browser-based image viewer for RPG Maker MZ games. Runs entirely client-side — no server, no uploads, no data leaves your machine.

> **Current scope:** Viewing and previewing encrypted/unencrypted images inside the `img/` folder of an RPG Maker MZ deployment.  
> **Planned:** Expanded format support and full extraction features drawing on the decryption logic from [RPGMakerDecrypter](https://github.com/uuksu/RPGMakerDecrypter).

---

## Features

- **Zero-install** — open `index.html` directly in any modern browser
- **Local-only processing** — files are read via the browser File API; nothing is uploaded or transmitted
- **Auto key extraction** — reads `encryptionKey` from `data/System.json` automatically
- **Manual key entry** — hex key can be typed directly if you already know it
- **Folder browser** — sidebar groups images by sub-folder (characters, faces, tilesets, …)
- **Lazy-loaded grid** — renders thumbnails on demand; handles large `img/` directories without freezing
- **Lightbox viewer** — full-resolution preview with keyboard navigation (`←` / `→` / `Esc`)
- **Search** — real-time filename filter
- **Adjustable tile size** — slider from 70 px to 280 px

## Supported Formats

| Extension | Description |
|-----------|-------------|
| `.rpgmvp` / `.png_` | Encrypted PNG (RPG Maker MV/MZ) — decrypted in-browser |
| `.png`, `.jpg`, `.jpeg` | Standard images — displayed directly |
| `.gif`, `.webp`, `.bmp` | Standard images — displayed directly |

## Getting Started

1. Clone or download this repository.
2. Open `index.html` in a Chromium-based browser (Chrome, Edge, Brave) or Firefox.
3. In **Step 1**, click **Chọn data/System.json…** and pick `<YourGame>/data/System.json`. The encryption key is read automatically.
4. In **Step 2**, click **Chọn thư mục img…** and pick the `<YourGame>/img/` folder.
5. Browse, search, and preview images.

> **Browser compatibility:** The `webkitdirectory` attribute required for folder selection is supported by all major desktop browsers. Mobile browsers may not support it.

## Project Structure

```
rpg-maker-decrypter-ui/
├── index.html          # Single-file application (HTML + CSS + JS)
├── LICENSE
├── README.md
└── references/         # Local reference code (not committed — see .gitignore)
    └── RPGMakerDecrypter/   # Reference: uuksu/RPGMakerDecrypter (MIT)
```

---

## Legal Notice

This section exists to be explicit about what this tool does and does not do, and to reduce the risk of DMCA or similar complaints for contributors and users.

### What the tool does (technically)

RPG Maker MZ stores an XOR obfuscation key in **plaintext** inside `data/System.json`, which ships with every game deployment. The "encrypted" image files (`.rpgmvp`, `.png_`) have their first 16 bytes XOR-ed with the key and then prepended with a 16-byte RPG Maker header. This tool:

1. Reads `System.json` from the user's local filesystem to obtain the key.
2. Uses that key — already present on the user's machine — to reverse the XOR and recover the original image bytes entirely inside the browser's memory.
3. Renders those bytes as an image using an `<img>` element with a temporary Blob URL.
4. **Never uploads, stores, or transmits any file or key to a remote server.**

Because the key is co-located with the content it "protects", this obfuscation is not considered effective access control under most legal interpretations, and is substantially different from true DRM systems (e.g., commercial encryption schemes where the key is not distributed with the content).

### Intended use

This tool is intended for:

- **Game developers** working on their own RPG Maker MZ projects who need to inspect or recover their own assets.
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

- [ ] Export / save decrypted images to disk (via `<a download>`)
- [ ] Batch export (ZIP via JSZip or streaming)
- [ ] Support RPG Maker MV (same format, already partially compatible)
- [ ] Support RPG Maker XP / VX / VX Ace (`.rgssad` archives) — planned with WebAssembly or a companion native helper, referencing RPGMakerDecrypter logic
- [ ] Audio preview (`.ogg_`, `.m4a_`)
- [ ] Drag-and-drop folder loading

## Acknowledgments

- [**RPGMakerDecrypter**](https://github.com/uuksu/RPGMakerDecrypter) by Mikko Uuksulainen — MIT licensed CLI reference implementation for RPG Maker XP/VX/MV/MZ decryption. The original author explicitly invited the creation of web UIs and cross-platform tools built on this work (see CHANGELOG v3.0.0).

## Contributing

Pull requests are welcome. For significant changes, open an issue first to discuss scope and approach.

Please do **not** commit actual game assets or encryption keys — even as test fixtures — without explicit permission from the relevant copyright holder.

## License

MIT © 2026 Trương Tuấn Anh — see [LICENSE](LICENSE).

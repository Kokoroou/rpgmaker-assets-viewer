# MakerLens

A browser-based media viewer for RPG Maker games. Supports **MV, MZ, XP, VX and VX Ace**. Runs entirely client-side: no server, no uploads; your game files and keys never leave your machine.

**[Try it live →](https://kokoroou.github.io/rpgmaker-assets-viewer/)**

<video src="https://github.com/user-attachments/assets/aa643c3b-81a1-4a13-936a-ebf4ea69e886" controls width="100%"></video>

## Features

- **Zero install, no build** — open the site, or `index.html` locally, in any modern browser
- **Local-only processing** — files are read with the browser File API; no file or key is ever uploaded
- **Automatic key handling** — reads `encryptionKey` from `data/System.json`; if that is missing or broken, recovers the key from a known PNG header (kept in memory only)
- **Folders, archives and loose files** — pick or drop a game folder, an `.rgssad` / `.rgss2a` / `.rgss3a` archive, or individual encrypted files
- **Fast on big games** — folders are scanned lazily in the background; thumbnails load on demand
- **Image and audio preview** — grid, lightbox with keyboard navigation, in-browser audio player
- **Export** — download one asset, or the whole current folder as a `.zip` (files that cannot be read are listed, not silently dropped)
- **Duplicate finder** — "Unique only" hides files with identical content (SHA-256 of the decrypted bytes, computed in the browser); copies are badged and grouped in a Duplicates folder
- **Search, adjustable tiles, light/dark theme**

## Supported formats

| Engine | Files | Decryption |
|--------|-------|------------|
| MV | `.rpgmvp` (image), `.rpgmvo` / `.rpgmvm` (audio) | 16-byte XOR with the key from `System.json` |
| MZ | `.png_` (image), `.ogg_` / `.m4a_` (audio) | same |
| XP / VX | `.rgssad`, `.rgss2a` (RGSSAD v1) | key embedded in the archive |
| VX Ace | `.rgss3a` (RGSSAD v3) | per-file keys embedded in the archive |
| Any | `.png` `.jpg` `.gif` `.webp` `.bmp` `.ogg` `.m4a` | none, shown as is |

Algorithms and their sources are documented in the code comments (`js/decrypt-*.js`).

## Getting started

1. Open **[MakerLens](https://kokoroou.github.io/rpgmaker-assets-viewer/)**.
2. Click **Select Game Folder** (or drop the folder anywhere on the page) and choose the game's root directory. For XP / VX / VX Ace you can also click **Select archive**.
3. Browse, search, click an asset to preview it, or use **Download folder**.

Desktop Chrome, Edge, Firefox and Brave work best; mobile browsers may not support folder selection. More help (where the key is, offline use, supported versions): [FAQ](https://kokoroou.github.io/rpgmaker-assets-viewer/faq.html).

## Privacy and legal

- **Privacy:** your files are processed only in your browser. The public site counts anonymous page visits (GoatCounter) and sends feedback only when you choose to. What is sent, and what never is, is defined in [`privacy.html`](https://kokoroou.github.io/rpgmaker-assets-viewer/privacy.html), the single source of truth. A Content-Security-Policy makes the browser block every other host.
- **Legal:** intended for your own assets or work done with the rights holder's permission. See [`LEGAL.md`](LEGAL.md) for intended use, user responsibility and takedown policy.

## Documentation

| Document | What it covers |
|----------|----------------|
| [`privacy.html`](privacy.html) | exactly what the site sends and stores |
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

# Legal Notice

This section exists to be explicit about what this tool does and does not do, and to reduce the risk of DMCA or similar complaints for contributors and users.

## What the tool does (technically)

**RPG Maker MV/MZ:** The engine stores an XOR obfuscation key in **plaintext** inside `data/System.json`, which ships with every game deployment. Encrypted files (`.rpgmvp`, `.png_`, `.rpgmvo`, `.ogg_`, etc.) have their first 16 bytes XOR-ed with the key and a 16-byte RPG Maker header prepended. This tool reads `System.json` from the user's local filesystem to obtain the key, reverses the XOR entirely inside the browser's memory, and renders the result via a temporary Blob URL.

**RPG Maker XP/VX/VX Ace:** Assets are packed into a single archive file (`.rgssad`, `.rgss2a`, `.rgss3a`). The decryption key is **embedded in the archive itself** — not distributed separately. This tool parses the archive binary, decrypts each file using the embedded key, and renders the result in-browser.

In both cases, the tool:
- **Reads only files the user explicitly selects** from their local filesystem.
- **Never uploads, stores, or transmits any file or key to a remote server.**

Because the keys are co-located with (or embedded in) the content they "protect", this obfuscation is not considered effective access control under most legal interpretations, and is substantially different from true DRM systems (e.g., commercial encryption schemes where the key is not distributed with the content).

## Intended use

This tool is intended for:

- **Game developers** working on their own RPG Maker projects who need to inspect or recover their own assets.
- **Artists and contributors** who created assets for a game and need to review or retrieve their own work.
- **Modders** operating under explicit permission from the game's copyright holder.
- **Researchers and educators** studying file formats or game development workflows.

## What this tool is NOT for

- Extracting, distributing, or repurposing assets from games you do not own or have not received explicit permission to modify.
- Circumventing access controls on commercially distributed games without authorization.
- Any use that violates the End User License Agreement of the game or the RPG Maker engine.

## User responsibility

By using this tool, you accept that:

1. You are responsible for ensuring you have the legal right to access and process the files you select.
2. This tool does not grant you any rights over third-party copyrighted content.
3. The authors of this tool are not liable for how you use the output.

Game assets (images, audio, scripts) distributed with a game are protected by copyright regardless of whether they are obfuscated. Decrypting them for personal inspection does not create a license to redistribute them.

## RPG Maker EULA

Kadokawa / Gotcha Gotcha Games publish separate EULAs for each RPG Maker version. Consult the EULA that applies to the specific game you are working with. Common restrictions include limitations on asset redistribution and derivative works.

## DMCA / takedown

If you are a rights holder and believe this tool is being used to infringe your copyright, please open an issue or contact the maintainer directly. We will respond promptly. Note that a takedown request directed at this repository must target the tool itself, not individual users' actions, which are outside this project's control.

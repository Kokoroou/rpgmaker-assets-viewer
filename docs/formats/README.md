# Format descriptions

[Kaitai Struct](https://kaitai.io/) descriptions of the formats MakerLens reads. They are
documentation only: the app does not use them and gains no dependency. Kaitai cannot
express the rolling-XOR key chains, so encrypted fields are shown as raw values with the
decoding rules in each file's `doc`. The source of truth is `js/decrypt-*.js`; if the two
disagree, fix the doc. Not compiled or run in CI (illustrative; `size: x ^ 0` placeholders mark
fields whose length needs the XOR step).

- `rpgmvp.ksy` — MV/MZ encrypted images and audio
- `rgssad_v1.ksy` — XP/VX archives
- `rgssad_v3.ksy` — VX Ace archives

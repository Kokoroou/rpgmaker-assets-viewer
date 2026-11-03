meta:
  id: rgssad_v1
  title: RPG Maker XP/VX archive (.rgssad, .rgss2a), version 1
  file-extension: [rgssad, rgss2a]
  endian: le
doc: |
  Implemented in parseRGSSADv1 in js/decrypt-rgssad.js; reference:
  uuksu/RPGMakerDecrypter (MIT). Every u4 field and name byte below is XORed with a
  rolling key that starts at 0xDEADCAFE and advances as key = key * 7 + 3 (mod 2^32)
  after each u4 and after each name byte (the byte uses key & 0xFF). The key value
  after reading `size` is the starting key for that entry's data. Data is XORed
  4 bytes at a time with the little-endian key, which advances (same formula) every
  4 bytes. Kaitai cannot express this chain, so fields are shown as raw values.
seq:
  - id: magic
    contents: 'RGSSAD'
  - id: pad
    size: 1
  - id: version
    contents: [1]
  - id: entries
    type: entry
    repeat: eos
types:
  entry:
    seq:
      - id: name_len_enc
        type: u4
      - id: name_enc
        size: name_len_enc ^ 0
        doc: real length = name_len_enc XOR current key
      - id: size_enc
        type: u4
      - id: data_enc
        size: size_enc ^ 0
        doc: real size = size_enc XOR current key; bytes are XOR-obfuscated

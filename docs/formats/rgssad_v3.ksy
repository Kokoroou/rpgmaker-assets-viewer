meta:
  id: rgssad_v3
  title: RPG Maker VX Ace archive (.rgss3a), version 3
  file-extension: rgss3a
  endian: le
doc: |
  Implemented in parseRGSSADv3 (js/decrypt-rgssad.js); reference:
  uuksu/RPGMakerDecrypter (MIT). Master key = base_key * 9 + 3 (mod 2^32). Directory
  fields are XORed with the master key (names byte-wise with its little-endian bytes,
  cycling every 4); the table ends at an entry whose real offset is 0. Each file's data
  is XORed with its own `file_key`, advancing key = key * 7 + 3 every 4 bytes.
seq:
  - id: magic
    contents: 'RGSSAD'
  - id: pad
    size: 1
  - id: version
    contents: [3]
  - id: base_key
    type: u4
  - id: entries
    type: entry
    repeat: eos
    doc: the real table ends at an entry whose offset XOR master key is 0; file data follows
types:
  entry:
    seq:
      - id: offset_enc
        type: u4
      - id: size_enc
        type: u4
      - id: file_key_enc
        type: u4
      - id: name_len_enc
        type: u4
      - id: name_enc
        size: name_len_enc ^ 0
        doc: real length = name_len_enc XOR master key

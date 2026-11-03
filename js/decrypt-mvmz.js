function decryptMVMZ(buffer, hexKey) {
  const hdr = new Uint8Array(buffer, 0, 16);
  for (let i = 0; i < 16; i++)
    if (hdr[i] !== RPG_HEADER[i])
      throw new Error('Invalid header — wrong key or not an RPG Maker MV/MZ file');
  const body  = buffer.slice(16);
  const view  = new DataView(body);
  const bytes = hexKey.match(/.{2}/g);
  if (!bytes || bytes.length < 16) throw new Error('Key too short (needs 32 hex characters)');
  for (let i = 0; i < 16; i++)
    view.setUint8(i, view.getUint8(i) ^ parseInt(bytes[i], 16));
  return body;
}

// Recover the 16-byte key from an encrypted image when System.json is missing or wrong.
// Format: 16-byte RPG header, then the PNG whose first 16 bytes are XORed with the key.
// Every PNG starts with the same 16 bytes (8-byte signature + IHDR length 13 + "IHDR"),
// so key = ciphertext ^ known plaintext. Same idea as the reference decrypters listed in
// docs/ROADMAP.md (item 1). Returns a 32-char hex string, or null if the file is not an
// MV/MZ-encrypted image. The key is only held in memory by the caller.
const PNG_PREFIX = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
                    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52];

function deriveKeyFromPNG(buffer) {
  if (!buffer || buffer.byteLength < 32) return null;
  const b = new Uint8Array(buffer, 0, 32);
  for (let i = 0; i < 16; i++) if (b[i] !== RPG_HEADER[i]) return null;
  let hex = '';
  for (let i = 0; i < 16; i++) hex += (b[16 + i] ^ PNG_PREFIX[i]).toString(16).padStart(2, '0');
  return hex;
}

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

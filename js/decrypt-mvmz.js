function decryptMVMZ(buffer, hexKey) {
  const hdr = new Uint8Array(buffer, 0, 16);
  for (let i = 0; i < 16; i++)
    if (hdr[i] !== RPG_HEADER[i])
      throw new Error('Header không hợp lệ — sai key hoặc file không phải RPG Maker MV/MZ');
  const body  = buffer.slice(16);
  const view  = new DataView(body);
  const bytes = hexKey.match(/.{2}/g);
  if (!bytes || bytes.length < 16) throw new Error('Key quá ngắn (cần 32 ký tự hex)');
  for (let i = 0; i < 16; i++)
    view.setUint8(i, view.getUint8(i) ^ parseInt(bytes[i], 16));
  return body;
}

const RPG_HEADER = [0x52, 0x50, 0x47, 0x4d, 0x56, 0, 0, 0, 0, 3, 1, 0, 0, 0, 0, 0];

const IMAGE_EXT = /\.(png_|rpgmvp|png|jpe?g|gif|webp|bmp)$/i;
const AUDIO_EXT = /\.(ogg_|m4a_|rpgmvo|rpgmvm|ogg|m4a)$/i;
const MEDIA_EXT = /\.(png_|rpgmvp|png|jpe?g|gif|webp|bmp|ogg_|m4a_|rpgmvo|rpgmvm|ogg|m4a)$/i;

const ENC_IMAGE_EXT = /\.(png_|rpgmvp)$/i;
const ENC_AUDIO_EXT = /\.(ogg_|rpgmvo|m4a_|rpgmvm)$/i;

const EXT_REMAP = {
  'png_': 'png', rpgmvp: 'png',
  'ogg_': 'ogg', rpgmvo: 'ogg',
  'm4a_': 'm4a', rpgmvm: 'm4a',
};

function canonicalExt(filename) {
  return filename.replace(/\.([^.]+)$/, (_, e) => '.' + (EXT_REMAP[e.toLowerCase()] || e));
}

function getMimeType(filename) {
  const ext  = (filename.split('.').pop() || '').toLowerCase();
  const real = EXT_REMAP[ext] || ext;
  const MAP  = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
    gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp',
    ogg: 'audio/ogg', m4a: 'audio/mp4',
  };
  return MAP[real] || 'application/octet-stream';
}

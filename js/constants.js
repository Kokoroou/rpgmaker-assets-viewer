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

// File and folder names come from the opened game, so they are untrusted: escape them
// before putting them into innerHTML (text or a quoted attribute).
const HTML_ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => HTML_ESC[c]);
}

// ZIP entry names come from the opened game/archive, so they are untrusted. Keep only the
// last path segment (no "..", no absolute or drive paths), drop characters Windows forbids,
// control characters and trailing dots/spaces, and avoid reserved device names.
const WIN_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
function sanitizeFileName(name) {
  let n = String(name ?? '').split(/[\\/]/).pop();
  n = n.replace(/[\x00-\x1f\x7f<>:"|?*]/g, '_').replace(/[. ]+$/, '').replace(/^ +/, '');
  if (!n || /^\.+$/.test(n)) n = 'file';
  const dot = n.lastIndexOf('.');
  const stem = dot > 0 ? n.slice(0, dot) : n;
  if (WIN_RESERVED.test(stem)) n = '_' + n;
  return n.length > 200 ? n.slice(0, 200) : n;
}

// Sanitize every name and make them unique (case-insensitively, as Windows/macOS
// extract) by adding " (2)", " (3)"... before the extension.
function uniqueZipNames(names) {
  const seen = new Set();
  return names.map(raw => {
    const base = sanitizeFileName(raw);
    let name = base, i = 2;
    while (seen.has(name.toLowerCase())) {
      const dot = base.lastIndexOf('.');
      name = dot > 0 ? `${base.slice(0, dot)} (${i})${base.slice(dot)}` : `${base} (${i})`;
      i++;
    }
    seen.add(name.toLowerCase());
    return name;
  });
}

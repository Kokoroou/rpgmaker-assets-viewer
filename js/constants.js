const RPG_HEADER = [0x52, 0x50, 0x47, 0x4d, 0x56, 0, 0, 0, 0, 3, 1, 0, 0, 0, 0, 0];

// Features that run only on the MakerLens home, never on the legacy GitHub Pages copy
// (CLAUDE.md, "Which site to build for"): mp3/wav/mid listing, typing by bytes and
// RPG Maker 2000/2003 (.xyz images, js/xyz.js). js/site.js loads first; without it
// (tests, local copies) they are on.
const NEW_FEATURES = !(typeof SITE !== 'undefined' && SITE.isLegacy);

const IMAGE_EXT = NEW_FEATURES ? /\.(png_|rpgmvp|png|jpe?g|gif|webp|bmp|xyz)$/i
  : /\.(png_|rpgmvp|png|jpe?g|gif|webp|bmp)$/i;

// mp3 / wav / mid: XP, VX and VX Ace games (RGSS) ship them next to ogg, as plain
// files or inside the archive (see mkxp's audio loaders, references/RPGMakerDecrypter).
const AUDIO_EXT = NEW_FEATURES ? /\.(ogg_|m4a_|rpgmvo|rpgmvm|ogg|m4a|mp3|wav|midi?)$/i
  : /\.(ogg_|m4a_|rpgmvo|rpgmvm|ogg|m4a)$/i;
const MEDIA_EXT = NEW_FEATURES ? /\.(png_|rpgmvp|png|jpe?g|gif|webp|bmp|xyz|ogg_|m4a_|rpgmvo|rpgmvm|ogg|m4a|mp3|wav|midi?)$/i
  : /\.(png_|rpgmvp|png|jpe?g|gif|webp|bmp|ogg_|m4a_|rpgmvo|rpgmvm|ogg|m4a)$/i;
// Browsers have no MIDI synthesizer: such files are listed and downloaded, not played.
const MIDI_EXT = /\.midi?$/i;

const ENC_IMAGE_EXT = /\.(png_|rpgmvp)$/i;
const ENC_AUDIO_EXT = /\.(ogg_|rpgmvo|m4a_|rpgmvm)$/i;

const EXT_REMAP = {
  'png_': 'png', rpgmvp: 'png',
  'ogg_': 'ogg', rpgmvo: 'ogg',
  'm4a_': 'm4a', rpgmvm: 'm4a',
};
if (NEW_FEATURES) EXT_REMAP.xyz = 'png';   // RPG Maker 2000/2003 images are shown and saved as PNG (js/xyz.js)

function canonicalExt(filename) {
  return filename.replace(/\.([^.]+)$/, (_, e) => '.' + (EXT_REMAP[e.toLowerCase()] || e));
}

function getMimeType(filename) {
  const ext  = (filename.split('.').pop() || '').toLowerCase();
  const real = EXT_REMAP[ext] || ext;
  const MAP  = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
    gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp',
    ogg: 'audio/ogg', m4a: 'audio/mp4', mp3: 'audio/mpeg', wav: 'audio/wav',
    mid: 'audio/midi', midi: 'audio/midi',
  };
  return MAP[real] || 'application/octet-stream';
}

// Type of decrypted bytes from their signature ('' when unknown). Some games ship
// WebP or JPEG under .png_ / .rpgmvp, so the name alone is not enough. Same checks
// as sniffMime() in MakerLens Events (js/media.js).
const SNIFF_EXT = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/bmp': 'bmp',
  'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/wav': 'wav', 'audio/mpeg': 'mp3', 'audio/midi': 'mid',
};
function sniffMime(data) {
  const b = data instanceof Uint8Array ? data.subarray(0, 12) : new Uint8Array(data, 0, Math.min(12, data.byteLength));
  const at = (o, s) => b.length >= o + s.length && [...s].every((c, i) => b[o + i] === c.charCodeAt(0));
  if (b[0] === 0x89 && at(1, 'PNG')) return 'image/png';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (at(0, 'GIF8')) return 'image/gif';
  if (at(0, 'RIFF') && at(8, 'WEBP')) return 'image/webp';
  if (at(0, 'RIFF') && at(8, 'WAVE')) return 'audio/wav';
  if (at(0, 'BM')) return 'image/bmp';
  if (at(0, 'OggS')) return 'audio/ogg';
  if (at(4, 'ftyp')) return 'audio/mp4';
  if (at(0, 'MThd')) return 'audio/midi';
  if (at(0, 'ID3') || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)) return 'audio/mpeg';
  return '';
}

// Blob type for an entry's bytes: the signature wins over the name.
function mimeFor(name, data) {
  return (NEW_FEATURES && sniffMime(data)) || getMimeType(name);
}

// Name to save decrypted bytes under: the real extension (canonicalExt), or the one
// their type (sniffMime) shows when they disagree (a WebP shipped as .png_ → .webp).
function savedName(name, mime) {
  const out = canonicalExt(name);
  const ext = NEW_FEATURES && SNIFF_EXT[mime];
  if (!ext) return out;
  const cur = (out.match(/\.([^./]+)$/) || [])[1]?.toLowerCase();
  const same = cur === ext || (ext === 'jpg' && cur === 'jpeg') || (ext === 'mid' && cur === 'midi');
  return same ? out : out.replace(/(\.[^./]+)?$/, '.' + ext);
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

// Files directly in the picked folder (folder key '__root__'): named for people, not "root".
const ROOT_LABEL = 'Top folder';

// Anonymous usage count by fixed name (js/analytics.js; no-op until it has loaded, off the
// public site and with Do Not Track / GPC). Never pass anything built from a file or game.
const track = name => (typeof countEvent === 'function' ? countEvent(name) : Promise.resolve());
// Engine label ('RPG Maker VX Ace', 'RPG Maker 2000/2003'…) → the event name of its family.
function engineEvent(label) {
  const l = label || '';
  return /MV\/MZ/.test(l) ? 'engine-mvmz' : /2000|2003/.test(l) ? 'engine-2k' : /VX Ace/i.test(l) ? 'engine-vxace' : /\bVX\b/.test(l) ? 'engine-vx'
       : /\bXP\b/.test(l) ? 'engine-xp' : /\bMZ\b/.test(l) ? 'engine-mz' : /\bMV\b/.test(l) ? 'engine-mv' : 'engine-other';
}

// What to say when a picked folder holds no image or audio: name it and say which folder to
// pick. A folder inside the game (data/, js/, img/pictures…) gets "the folder above it".
const INNER_DIRS = /^(data|js|fonts|save|movies|effects|icon|css|locales?)$/i;
// The error a loader throws for it: runLoad counts it apart from other failures.
function noMediaError(name) { const e = new Error(noMediaMessage(name)); e.noMedia = true; return e; }
function noMediaMessage(name) {
  const where = "the game's main folder: the one that holds img/ and audio/ (or Graphics/ and Audio/, or an .rgss archive), usually next to Game.exe";
  if (name && INNER_DIRS.test(name)) return `"${name}" is a folder inside the game and holds no images or audio. Select the folder above it instead, ${where}.`;
  return `No images or audio found${name ? ` in "${name}"` : ''}. Select ${where}.`;
}

// File order in the grid: by name, numbers by value (Actor2 before Actor10), case ignored.
const NAME_ORDER = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
const byName = paths => paths.slice().sort(NAME_ORDER.compare);

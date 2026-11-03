// RPG Maker character sprite sheets (roadmap item 6).
// Convention (MV/MZ img/characters, VX/VX Ace Graphics/Characters):
//   "$name" = one character: 3 columns x 4 rows of frames.
//   otherwise = 8 characters in a 4x2 block: 12 columns x 8 rows (each character 3x4).
//   "!" in the name = object (not shifted half a tile); it does not change the layout.
// Rows are directions: 0 down, 1 left, 2 right, 3 up. Walk cycle is columns 0,1,2,1.
// Frame size is derived from the image size, so 32/48 px cells both work.

const SPRITE_WALK = [0, 1, 2, 1];

// Returns null if the name/size does not look like a sheet.
function spriteLayout(fileName, w, h) {
  const base = String(fileName).split('/').pop();
  const bang = base.match(/^[!$]+/);
  const single = !!bang && bang[0].includes('$');
  const cols = single ? 3 : 12, rows = single ? 4 : 8;
  if (!(w > 0 && h > 0) || w % cols || h % rows) return null;
  return { single, object: !!bang && bang[0].includes('!'), cw: w / cols, ch: h / rows,
           chars: single ? 1 : 8 };
}

// Source rectangle of one frame. char 0..chars-1, dir 0..3, step = walk index.
function spriteFrame(layout, char, dir, step) {
  const bx = layout.single ? 0 : (char % 4) * 3;
  const by = layout.single ? 0 : Math.floor(char / 4) * 4;
  const col = bx + SPRITE_WALK[((step % 4) + 4) % 4];
  return { sx: col * layout.cw, sy: (by + dir) * layout.ch, sw: layout.cw, sh: layout.ch };
}

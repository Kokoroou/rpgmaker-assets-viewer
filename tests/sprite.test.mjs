import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const ctx = vm.createContext({});
vm.runInContext(readFileSync(new URL('../js/sprite.js', import.meta.url), 'utf8'), ctx);
const { spriteLayout, spriteFrame } = vm.runInContext('({ spriteLayout, spriteFrame })', ctx);
const plain = o => (o && JSON.parse(JSON.stringify(o)));

test('"$" is a single 3x4 character, plain is 12x8 sheet, "!" only marks objects', () => {
  assert.deepEqual(plain(spriteLayout('$Hero.png', 144, 192)), { single: true, object: false, cw: 48, ch: 48, chars: 1 });
  assert.deepEqual(plain(spriteLayout('Actor1.png', 576, 384)), { single: false, object: false, cw: 48, ch: 48, chars: 8 });
  assert.equal(spriteLayout('!$Chest.png', 96, 128).object, true);
  assert.equal(spriteLayout('img/characters/$a.png', 96, 128).cw, 32);
});

test('rejects sizes that do not divide into the grid', () => {
  assert.equal(spriteLayout('Actor1.png', 575, 384), null);
  assert.equal(spriteLayout('$a.png', 0, 0), null);
});

test('frame rects follow character, direction and the 0,1,2,1 cycle', () => {
  const sheet = spriteLayout('Actor1.png', 576, 384);
  assert.deepEqual(plain(spriteFrame(sheet, 0, 0, 0)), { sx: 0, sy: 0, sw: 48, sh: 48 });
  assert.deepEqual(plain(spriteFrame(sheet, 5, 2, 3)), { sx: (3 + 1) * 48, sy: (4 + 2) * 48, sw: 48, sh: 48 });
  const one = spriteLayout('$a.png', 144, 192);
  assert.deepEqual([0, 1, 2, 3, 4].map(s => spriteFrame(one, 0, 3, s).sx / 48), [0, 1, 2, 1, 0]);
});

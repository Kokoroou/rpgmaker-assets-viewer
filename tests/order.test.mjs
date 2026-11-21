// Grid order (js/constants.js): names sorted with numbers by value.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const ctx = vm.createContext({ TextDecoder, TextEncoder, Intl });
vm.runInContext(readFileSync(new URL('../js/constants.js', import.meta.url), 'utf8'), ctx, { filename: 'constants.js' });
const byName = vm.runInContext('byName', ctx);

test('files sort by name with numbers by value, case ignored', () => {
  const list = ['img/faces/Actor10.png_', 'img/faces/actor2.png_', 'img/faces/Actor1.png_', 'img/faces/Boss.png_'];
  assert.deepEqual([...byName(list)], ['img/faces/Actor1.png_', 'img/faces/actor2.png_', 'img/faces/Actor10.png_', 'img/faces/Boss.png_']);
});

test('the folder list itself is not reordered in place', () => {
  const list = ['b', 'a'];
  byName(list);
  assert.deepEqual(list, ['b', 'a']);
});

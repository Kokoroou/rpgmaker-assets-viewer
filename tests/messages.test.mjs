// Messages shown when a picked folder holds nothing to show (js/constants.js).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const ctx = vm.createContext({ TextDecoder, TextEncoder });
vm.runInContext(readFileSync(new URL('../js/constants.js', import.meta.url), 'utf8'), ctx, { filename: 'constants.js' });
const { noMediaMessage, ROOT_LABEL } = vm.runInContext('({ noMediaMessage, ROOT_LABEL })', ctx);

test('a folder inside the game says to pick the folder above it', () => {
  for (const name of ['data', 'Data', 'js', 'save'])
    assert.match(noMediaMessage(name), new RegExp(`^"${name}" is a folder inside the game.*Select the folder above it`));
});

test('any other folder is named and the right folder is described', () => {
  assert.match(noMediaMessage('Photos'), /^No images or audio found in "Photos"\. Select the game's main folder/);
  assert.match(noMediaMessage(''), /^No images or audio found\. Select/);
});

test('files at the top of the picked folder get a readable label', () => {
  assert.equal(ROOT_LABEL, 'Top folder');
});

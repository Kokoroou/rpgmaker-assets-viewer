import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const ctx = vm.createContext({});
vm.runInContext(readFileSync(new URL('../js/site.js', import.meta.url), 'utf8') + '\n;this.SITE = SITE;', ctx, { filename: 'site.js' });
const { SITE } = ctx;

test('outside a browser the site is neither public nor legacy', () => {
  assert.equal(SITE.isPublic, false);
  assert.equal(SITE.isLegacy, false);
});

test('homeURL maps each legacy page to the same page under /assets/', () => {
  const home = 'https://makerlens.kokoroou.workers.dev/assets/';
  assert.equal(SITE.homeURL('/rpgmaker-assets-viewer/'), home);
  assert.equal(SITE.homeURL('/rpgmaker-assets-viewer/index.html'), home + 'index.html');
  assert.equal(SITE.homeURL('/rpgmaker-assets-viewer/faq.html'), home + 'faq.html');
  assert.equal(SITE.homeURL('/rpgmaker-assets-viewer/privacy.html', '', '#feedback'), home + 'privacy.html#feedback');
});

test('homeURL keeps traffic-source params and falls back to the tool root', () => {
  const home = 'https://makerlens.kokoroou.workers.dev/assets/';
  assert.equal(SITE.homeURL('/rpgmaker-assets-viewer/', '?utm_source=chatgpt.com'), home + '?utm_source=chatgpt.com');
  assert.equal(SITE.homeURL('/somewhere-else/x.html', '?a=1'), home + '?a=1');
});

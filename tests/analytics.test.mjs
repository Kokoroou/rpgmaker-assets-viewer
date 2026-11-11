import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Runs js/site.js + js/analytics.js with a fake browser; returns the requests and countEvent.
function setup({ host = 'makerlens.kokoroou.workers.dev', dnt, gpc } = {}) {
  const sent = [], images = [];
  class Image { set src(u) { sent.push(new URL(u)); images.push(this); } }
  const ctx = vm.createContext({
    location: { hostname: host, pathname: '/assets/', search: '' },
    navigator: { doNotTrack: dnt, globalPrivacyControl: gpc },
    document: { referrer: '' },
    Image, URLSearchParams, Math, setTimeout, Promise,
  });
  for (const f of ['site.js', 'analytics.js']) vm.runInContext(readFileSync(new URL(`../js/${f}`, import.meta.url), 'utf8'), ctx, { filename: f });
  return { sent, images, countEvent: vm.runInContext('countEvent', ctx) };
}

test('countEvent: the fixed names are sent as events with no other data', async () => {
  const { sent, images, countEvent } = setup();
  sent.length = 0; images.length = 0;
  const done = countEvent('switch-to-events');
  assert.equal(sent.length, 1);
  assert.deepEqual([...sent[0].searchParams.keys()].sort(), ['e', 'p', 'rnd', 't']);
  assert.equal(sent[0].searchParams.get('p'), 'switch-to-events');
  images[0].onerror();                          // answered or failed: either way the page may go on
  await done;
  await countEvent('feedback-sent');
  assert.equal(sent.length, 2);
  await countEvent('anything-else');            // not in the list: nothing is sent
  assert.equal(sent.length, 2);
});

test('countEvent resolves after a short wait without an answer, and is a no-op off the public site', async () => {
  const a = setup(); a.sent.length = 0;
  await a.countEvent('switch-to-events');
  assert.equal(a.sent.length, 1);
  const b = setup({ host: 'localhost' });
  await b.countEvent('switch-to-events');
  assert.equal(b.sent.length, 0);
  const c = setup({ gpc: true });
  await c.countEvent('switch-to-events');
  assert.equal(c.sent.length, 0);
});

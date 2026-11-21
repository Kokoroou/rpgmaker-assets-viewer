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

test('countEvent sends each name at most once per page load', async () => {
  const { sent, countEvent } = setup();
  sent.length = 0;
  await countEvent('open-picker');
  await countEvent('open-picker');
  await countEvent('lightbox-image');
  assert.deepEqual(sent.map(u => u.searchParams.get('p')), ['open-picker', 'lightbox-image']);
  for (const u of sent) assert.deepEqual([...u.searchParams.keys()].sort(), ['e', 'p', 'rnd', 't']);
});

test('every name the app counts is in the list analytics.js sends', () => {
  const src = ['app.js', 'ui.js', 'filters.js', 'feedback.js']
    .map(f => readFileSync(new URL(`../js/${f}`, import.meta.url), 'utf8')).join('\n');
  const list = readFileSync(new URL('../js/analytics.js', import.meta.url), 'utf8');
  const used = new Set([...src.matchAll(/\b(?:track|event)\(\s*'([a-z0-9-]+)'/g)].map(m => m[1]));
  for (const m of src.matchAll(/(?:[}\]], |way = )'((?:open|engine)-[a-z0-9-]+)'/g)) used.add(m[1]);   // runLoad's way argument
  for (const m of readFileSync(new URL('../js/constants.js', import.meta.url), 'utf8').matchAll(/'(engine-[a-z0-9]+)'/g)) used.add(m[1]);
  assert.ok(used.size > 20);
  for (const name of used) assert.ok(list.includes(`'${name}'`), `${name} is not in EVENTS`);
});

test('engineEvent maps engine labels to the fixed engine names', () => {
  const ctx = vm.createContext({});
  vm.runInContext(readFileSync(new URL('../js/constants.js', import.meta.url), 'utf8') + '\nthis.engineEvent = engineEvent;', ctx);
  const cases = {
    'RPG Maker MZ': 'engine-mz', 'RPG Maker MV': 'engine-mv', 'MV/MZ': 'engine-mvmz', 'RPG Maker MV/MZ': 'engine-mvmz',
    'RPG Maker XP': 'engine-xp', 'RPG Maker VX': 'engine-vx', 'RPG Maker VX Ace': 'engine-vxace',
    'RPG Maker 2000/2003': 'engine-2k', 'RGSSAD archive': 'engine-other', '': 'engine-other', null: 'engine-other',
  };
  for (const [label, want] of Object.entries(cases)) assert.equal(ctx.engineEvent(label === 'null' ? null : label), want, label);
});

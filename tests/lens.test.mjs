import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// The redesign must never reach the legacy GitHub Pages copy (CLAUDE.md, "Legacy is untouched").
const run = hostname => {
  const attrs = {};
  const el = { setAttribute: (k, v) => { attrs[k] = v; }, getAttribute: k => attrs[k] || null };
  vm.runInNewContext(readFileSync('js/lens-gate.js', 'utf8'), {
    location: { hostname }, document: { documentElement: el, querySelectorAll: () => [] },
    window: {}, MutationObserver: class { observe() {} }, matchMedia: undefined,
  });
  return attrs;
};

test('lens-gate: legacy host gets no data-lens', () => {
  assert.equal('data-lens' in run('kokoroou.github.io'), false);
});
test('lens-gate: home, local and preview hosts get data-lens', () => {
  for (const h of ['makerlens.kokoroou.workers.dev', 'localhost', 'x.pages.dev']) assert.equal('data-lens' in run(h), true, h);
});

test('lens.css: everything but the two helper classes sits inside :root[data-lens]', () => {
  const css = readFileSync('css/lens.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  let depth = 0, head = '', outside = [];
  for (const ch of css) {
    if (ch === '{') { if (depth === 0) outside.push(head.trim()); depth++; head = ''; }
    else if (ch === '}') { depth--; head = ''; }
    else if (depth === 0) head += ch;
  }
  assert.deepEqual(outside, ['.lens-only', '.lens-sr', ':root[data-lens]']);
});

test('legacy copy: [data-new] is hidden by CSS from the first paint, not only by app.js', () => {
  const css = readFileSync('css/base.css', 'utf8');
  assert.match(css, /:root:not\(\[data-lens\]\) \[data-new\] \{ display: none !important; \}/);
  assert.match(readFileSync('css/style.css', 'utf8'), /@import 'base\.css';/);
});

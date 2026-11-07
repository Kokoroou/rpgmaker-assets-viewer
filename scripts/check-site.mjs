#!/usr/bin/env node
// Static checks for the site (no dependencies; run with `node scripts/check-site.mjs`).
// CI runs it as the lint step (.github/workflows/ci.yml). It guards the rules in
// CLAUDE.md that a browser would only reveal at runtime:
//   1. every js/*.js parses (`node --check`);
//   2. each inline <script> in a page is allowed by that page's CSP sha256 hash;
//   3. the CSP names no external host besides the GoatCounter endpoint and, in
//      index.html only, the feedback Worker (connect-src);
//   4. local src/href targets exist;
//   5. JSON-LD blocks are valid JSON, and the FAQ's FAQPage entries match the
//      visible questions and answers.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PAGES = ['index.html', 'privacy.html', 'faq.html'];
const ALLOWED_HOSTS = new Set(['makerlens.goatcounter.com']);
// The feedback inbox (private repo Kokoroou/feedbacks), only on the page that has the form.
const FEEDBACK_HOST = 'feedback.kokoroou.workers.dev';
// Game links (js/remote.js): games published with rpgmaker-web-toolkit live on workers.dev.
const GAME_HOSTS = '*.workers.dev';
const pageHosts = page => page === 'index.html' ? new Set([...ALLOWED_HOSTS, FEEDBACK_HOST, GAME_HOSTS]) : ALLOWED_HOSTS;

const errors = [];
const fail = (file, msg) => errors.push(`${file}: ${msg}`);

// 1. JavaScript syntax
for (const f of readdirSync(join(root, 'js')).filter(f => f.endsWith('.js')).sort()) {
  try {
    execFileSync(process.execPath, ['--check', join(root, 'js', f)], { stdio: 'pipe' });
  } catch (e) {
    fail(`js/${f}`, String(e.stderr || e.message).trim());
  }
}

const decode = s => s
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
const text = html => decode(html.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();

for (const page of PAGES) {
  const html = readFileSync(join(root, page), 'utf8');

  // 2. CSP vs inline scripts
  const csp = html.match(/<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]*)"/i);
  if (!csp) { fail(page, 'no Content-Security-Policy <meta> tag'); continue; }
  const policy = csp[1];
  const scriptSrc = (policy.match(/(?:^|;)\s*script-src([^;]*)/) || [])[1] || '';
  const allowedHashes = new Set([...scriptSrc.matchAll(/'sha256-([^']+)'/g)].map(m => m[1]));
  for (const m of html.matchAll(/<script(\s[^>]*)?>([\s\S]*?)<\/script>/gi)) {
    const attrs = m[1] || '';
    if (/\bsrc=/.test(attrs) || /type="application\/ld\+json"/.test(attrs)) continue;
    const hash = createHash('sha256').update(m[2], 'utf8').digest('base64');
    if (!allowedHashes.has(hash)) {
      fail(page, `an inline script's hash 'sha256-${hash}' is not in the CSP script-src (recompute it in all pages)`);
    }
  }

  // 3. External hosts in the CSP
  for (const m of policy.matchAll(/https?:\/\/([^\s;'"]+)/g)) {
    if (!pageHosts(page).has(m[1])) fail(page, `CSP allows external host '${m[1]}' (only GoatCounter, and in index.html the feedback Worker and *.workers.dev game links, are allowed)`);
  }

  // 4. Local references
  for (const m of html.matchAll(/\s(?:src|href)="([^"]+)"/g)) {
    const ref = m[1].split(/[?#]/)[0];
    if (!ref || /^(?:[a-z]+:|\/\/|#)/i.test(m[1])) continue;
    const target = join(root, ref.endsWith('/') ? ref + 'index.html' : ref);
    if (!existsSync(target)) fail(page, `missing local file '${m[1]}'`);
  }

  // 5. JSON-LD
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    let data;
    try { data = JSON.parse(m[1]); } catch (e) { fail(page, `invalid JSON-LD: ${e.message}`); continue; }
    if (data['@type'] !== 'FAQPage') continue;
    const visible = [...html.matchAll(/<details[^>]*>\s*<summary>([\s\S]*?)<\/summary>([\s\S]*?)<\/details>/g)]
      .map(d => ({ q: text(d[1]), a: text(d[2]) }));
    const ld = (data.mainEntity || []).map(e => ({ q: e.name, a: (e.acceptedAnswer || {}).text }));
    if (ld.length !== visible.length) {
      fail(page, `FAQPage JSON-LD has ${ld.length} questions, the page shows ${visible.length}`);
    }
    ld.forEach((e, i) => {
      const v = visible[i];
      if (!v) return;
      if (e.q !== v.q) fail(page, `FAQ question ${i + 1} differs: JSON-LD "${e.q}" vs page "${v.q}"`);
      else if (e.a !== v.a) fail(page, `FAQ answer to "${e.q}" differs between JSON-LD and the page`);
    });
  }
}

if (errors.length) {
  for (const e of errors) console.error(`::error::${e}`);
  console.error(`\n${errors.length} problem(s) found.`);
  process.exit(1);
}
console.log(`OK: ${PAGES.length} pages and js/*.js checked.`);

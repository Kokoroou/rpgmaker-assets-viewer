// Benchmark matrix: traverseHandle variants × CPU profiles × folder sizes, on OPFS.
// Results and method: docs/benchmarks/traverse-handle.md
// Usage (needs Playwright + Chromium, not a project dependency):
//   node docs/benchmarks/traverse-handle.bench.js
//   ONLY=1,6 SIZES=20000 REPS=3 node docs/benchmarks/traverse-handle.bench.js
// Uses synthetic 1 KB dummy files only — never real game assets.
const { chromium, devices } = require('playwright');
const fs = require('fs'), http = require('http'), path = require('path');
const { execSync } = require('child_process');
const ROOT = path.resolve(__dirname, '../..');
const REPO = path.join(ROOT, 'js/app.js');
// Last commit with the serial traverseHandle (PR #8 merge).
const BASELINE = process.env.BASELINE || 'b1ba1a4';
const grab = (src) => {
  const a = src.indexOf('// Modern path: File System Access API');
  const b = src.indexOf('// Legacy path: FileSystem Entry API');
  return src.slice(a, b);
};
const NEW = grab(fs.readFileSync(REPO, 'utf8'));
const OLD = grab(execSync(`git show ${BASELINE}:js/app.js`, { cwd: ROOT, encoding: 'utf8' }));
const withK = (k) => NEW.replace(/GET_FILE_CONCURRENCY = \d+/, 'GET_FILE_CONCURRENCY = ' + k);
const VARIANTS = { 'serial (old)': OLD, 'pool 4': withK(4), 'pool 8': withK(8), 'pool 16 (shipped)': NEW, 'pool 32': withK(32), 'pool 64': withK(64), 'unbounded': withK('Infinity') };
const PROFILES_ALL = [
  { name: 'Desktop (1x CPU)', rate: 1, dev: null },
  { name: 'Low-end laptop (2x)', rate: 2, dev: null },
  { name: 'Mid-range phone (4x, Pixel 7)', rate: 4, dev: 'Pixel 7' },
  { name: 'Low-end phone (6x, Galaxy S8)', rate: 6, dev: 'Galaxy S8' },
];
const PROFILES = PROFILES_ALL.filter(p => !process.env.ONLY || process.env.ONLY.split(',').includes(String(p.rate)));
const SIZES = (process.env.SIZES || '1000,5000,20000').split(',').map(Number);
const REPS = +(process.env.REPS || 3);
const page = `<!doctype html><title>b</title><script>
window.__v = {}; window.Loader = { check() {} };
${Object.entries(VARIANTS).map(([k, src]) => `window.__v[${JSON.stringify(k)}] = (function(){ ${src}; return traverseHandle; })();`).join('\n')}
</script>`;
const srv = http.createServer((q, r) => { r.setHeader('content-type', 'text/html'); r.end(page); }).listen(8766);
const median = a => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
(async () => {
  const browser = await chromium.launch({ args: ['--enable-precise-memory-info', '--js-flags=--expose-gc'] });
  const results = [];
  for (const prof of PROFILES) {
    const ctx = await browser.newContext(prof.dev ? { ...devices[prof.dev] } : {});
    const pg = await ctx.newPage();
    await pg.goto('http://localhost:8766/');
    const cdp = await ctx.newCDPSession(pg);
    for (const N of SIZES) {
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
      // Build synthetic tree in OPFS: game/www/{img,audio}/sub*/f*.png_ (no real assets)
      await pg.evaluate(async (N) => {
        const r = await navigator.storage.getDirectory();
        try { await r.removeEntry('game', { recursive: true }); } catch {}
        const g = await r.getDirectoryHandle('game', { create: true });
        const www = await g.getDirectoryHandle('www', { create: true });
        const buf = new Uint8Array(1024);
        const dirs = {};
        for (let i = 0; i < N; i++) {
          const top = i % 3 ? 'img' : 'audio', sub = 'sub' + (i % 25);
          const key = top + '/' + sub;
          if (!dirs[key]) dirs[key] = await (await www.getDirectoryHandle(top, { create: true })).getDirectoryHandle(sub, { create: true });
          const fh = await dirs[key].getFileHandle(`f${i}.png_`, { create: true });
          const w = await fh.createWritable(); await w.write(buf); await w.close();
        }
      }, N);
      // correctness: shipped vs old must give identical path order
      const same = await pg.evaluate(async () => {
        const g = await (await navigator.storage.getDirectory()).getDirectoryHandle('game');
        const a = [], b = [];
        await window.__v['serial (old)'](g, '', a);
        await window.__v['pool 16 (shipped)'](g, '', b);
        return a.length === b.length && a.every((f, i) => f._dragPath === b[i]._dragPath && f.size === b[i].size);
      });
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: prof.rate });
      for (const v of Object.keys(VARIANTS)) {
        const times = [], heaps = [];
        for (let k = 0; k < REPS; k++) {
          const r = await pg.evaluate(async (v) => {
            gc();
            const base = performance.memory.usedJSHeapSize; let peak = base;
            const iv = setInterval(() => { peak = Math.max(peak, performance.memory.usedJSHeapSize); }, 20);
            const g = await (await navigator.storage.getDirectory()).getDirectoryHandle('game');
            const files = []; const t = performance.now();
            await window.__v[v](g, '', files);
            const ms = performance.now() - t;
            clearInterval(iv); peak = Math.max(peak, performance.memory.usedJSHeapSize);
            return { ms, heap: (peak - base) / 1048576, n: files.length };
          }, v);
          times.push(r.ms); heaps.push(r.heap);
        }
        const row = { profile: prof.name, N, variant: v, ms: Math.round(median(times)), min: Math.round(Math.min(...times)), max: Math.round(Math.max(...times)), heapMB: +median(heaps).toFixed(1), orderOK: same };
        results.push(row); console.log(JSON.stringify(row));
      }
    }
    await ctx.close();
  }
  if (process.env.OUT) fs.writeFileSync(process.env.OUT, JSON.stringify(results, null, 1));
  await browser.close(); srv.close();
})();

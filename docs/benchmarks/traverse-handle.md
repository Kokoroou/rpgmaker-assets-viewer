# Benchmark: opening a game folder (`traverseHandle`)

Date: 2026-11-03 · PR #9 · Script: [`traverse-handle.bench.js`](traverse-handle.bench.js)

> **Superseded.** `traverseHandle` has been replaced by the lazy background scan in `js/scan.js`: only the root is read before the first folder appears, and `getFile()` runs in the background (same pool size, 16), folder on screen first. The script now benchmarks the eager walk from commit `5cc077a`.

## Question

How do the two ways of opening a game folder compare in speed and user bandwidth?

- **Directory picker / drag & drop**: `showDirectoryPicker` / `getAsFileSystemHandle`, walked by `traverseHandle` in `js/app.js`. Chrome's prompt says "view files".
- **`<input webkitdirectory>`**: the fallback for older browsers. Chrome's prompt says "upload".

## Bandwidth: 0 bytes either way

During every run below, Chromium recorded **0 network requests and 0 bytes**. Both methods hand the page lazy `File` references to the local disk. Chrome's "upload" wording describes nothing that actually happens. File contents are read only when a tile or the lightbox needs them (`entryToURL()`), and that read is the same for both methods. The only network traffic is the page load and the GoatCounter ping.

## Round 1: picker vs `webkitdirectory` (before the fix)

Chromium headless (Playwright 1.63). Synthetic tree, 20 subfolders, 3 runs each.

| Files | `webkitdirectory` | `traverseHandle`, serial (old) | `traverseHandle`, parallel (prototype) |
|---|---|---|---|
| 5 000 | 1.6–1.8 s | 2.4–2.7 s | 0.6–1.0 s |
| 20 000 | 4.8–5.0 s | 10.7–11.9 s | 2.7–5.2 s |

The old `traverseHandle` awaited `handle.getFile()` once per file. Each call waits for a round trip to the browser process, so time grew linearly with file count. As a result, the picker path was about 2× **slower** than the "upload" fallback. The `webkitdirectory` numbers include Playwright's path-injection overhead, so it is a little faster in practice.

## Fix

The new `traverseHandle` works in two phases:

1. List the tree with `values()`. This is cheap because the browser batches it.
2. Resolve the `File` objects through a pool with at most `GET_FILE_CONCURRENCY = 16` calls in flight.

Output order is unchanged (depth-first), as are `Loader.check()` (Cancel) and progress reporting.

## Round 2: hardware matrix

Method:
- Synthetic tree of 1 KB dummy files in OPFS, under `www/{img,audio}/sub0..24`.
- OPFS exposes the same `FileSystemHandle` API as the picker, but it is not a real disk, so read the numbers as relative.
- CPU is slowed with CDP `Emulation.setCPUThrottlingRate`. This slows only the renderer, not the browser process.
- The phone profiles also use the Playwright `Pixel 7` / `Galaxy S8` device descriptors (viewport, touch, UA).
- Each cell is the median of 3 runs.
- Every variant was checked against the serial walk: same paths, same order, same sizes. All passed.

### Time to open (ms)

| Profile | Files | Serial (old) | Pool 4 | Pool 8 | **Pool 16 (shipped)** | Pool 32 | Pool 64 | Unbounded |
|---|---|---|---|---|---|---|---|---|
| Desktop (1x) | 1 000 | 582 | 261 | 232 | **229** | 225 | 219 | 215 |
| Desktop (1x) | 5 000 | 2 685 | 1 147 | 942 | **902** | 906 | 882 | 824 |
| Desktop (1x) | 20 000 | 10 529 | 4 155 | 3 672 | **3 451** | 3 411 | 3 223 | 3 174 |
| Low-end laptop (2x) | 1 000 | 858 | 406 | 337 | **257** | 257 | 238 | 276 |
| Low-end laptop (2x) | 5 000 | 3 912 | 1 614 | 1 287 | **1 161** | 1 107 | 1 061 | 1 039 |
| Low-end laptop (2x) | 20 000 | 15 254 | 6 052 | 4 233 | **3 514** | 3 536 | 3 275 | 3 166 |
| Mid-range phone (4x, Pixel 7) | 1 000 | 1 388 | 562 | 415 | **336** | 376 | 325 | 326 |
| Mid-range phone (4x, Pixel 7) | 5 000 | 6 291 | 2 554 | 1 826 | **1 389** | 1 272 | 1 217 | 1 136 |
| Mid-range phone (4x, Pixel 7) | 20 000 | 25 821 | 9 173 | 6 690 | **5 153** | 4 668 | 4 724 | 3 825 |
| Low-end phone (6x, Galaxy S8) | 1 000 | 1 920 | 861 | 662 | **529** | 494 | 500 | 452 |
| Low-end phone (6x, Galaxy S8) | 5 000 | 9 379 | 3 318 | 2 378 | **2 130** | 1 915 | 1 878 | 1 547 |
| Low-end phone (6x, Galaxy S8) | 20 000 | 36 249 | 13 003 | 8 904 | **7 146** | 7 374 | 6 028 | 5 728 |

### Peak extra JS heap at 20 000 files (MB)

Sampled every 20 ms with `performance.memory`, after a forced GC.

| Profile | Serial | Pool 4 | Pool 8 | **Pool 16** | Pool 32 | Pool 64 | Unbounded |
|---|---|---|---|---|---|---|---|
| Desktop (1x) | 10.6 | 11.2 | 11.2 | **11.2** | 11.2 | 11.2 | 18.4 |
| Low-end laptop (2x) | 10.8 | 11.2 | 11.1 | **11.1** | 11.1 | 11.1 | 18.4 |
| Mid-range phone (4x) | 4.5 | 5.3 | 6.8 | **11.1** | 11.2 | 11.2 | 18.5 |
| Low-end phone (6x) | 4.0 | 5.3 | 6.1 | **6.8** | 8.4 | 11.2 | 11.0 |

Most of this is the resulting `File` list. The heap sampler sees less of it on slow profiles because GC runs in between. The unbounded variant adds roughly 7 MB of pending promises.

### Why 16

- It gets most of the gain: 3× faster on desktop and about 5× on throttled phones.
- 32 or 64 add only 0–15%, and the differences are within run-to-run noise.
- Unbounded keeps every `getFile()` (20 000 promises/IPC requests) pending at once. That memory spike is the main risk on low-RAM phones, and the speed gain is small.

## Round 3: after rebasing onto PR #8 (loader with Cancel and progress)

20 000 files, `Loader.check()` stubbed to a no-op.

| Profile | Serial (old) | Pool 16 | Speed-up |
|---|---|---|---|
| Desktop (1x) | 10 524 ms | 3 234 ms | 3.3× |
| Low-end phone (6x, Galaxy S8) | 36 832 ms | 7 007 ms | 5.3× |

## End-to-end checks on the real app

Real `index.html` served over HTTP, with `showDirectoryPicker` stubbed to return an OPFS folder of generated 1×1 PNGs:

| Check | Desktop | Pixel 7 |
|---|---|---|
| 600 files → 2 folders indexed, grid renders, no page errors | pass (296 ms) | pass (254 ms) |
| Progress label during scan | `200 / 6,000 files` | pass |
| Cancel mid-scan (6 000 files): loader closes, `_loading` reset, nothing loaded, no errors | pass | pass |

## Limits

- OPFS stands in for a real disk directory handle, because the native picker cannot be automated. A real disk adds permission checks and disk I/O, so absolute times will differ.
- CPU throttling emulates a slower renderer. It does not emulate phone storage, memory pressure, or a slower browser process.
- Not yet verified: manually opening a real game folder from disk in Chrome/Edge.
- Chrome on Android may not offer `showDirectoryPicker`. If so, phones use the `webkitdirectory` path, and this change mainly helps desktop users.

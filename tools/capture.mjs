// Capture mode — replays a recording in headless Chromium with a virtual
// clock, writes a PNG sequence, and encodes an MP4 via ffmpeg.
//
// Usage:
//   npm run capture -- --input recordings/recording-xxx.json
//   npm run capture -- --input ... --fps 60 --width 1080 --height 1920
//   npm run capture -- --input ... --no-encode      # PNGs only
//   npm run capture -- --input ... --output runs/v1 # custom output dir
//   npm run capture -- --input ... --tail 1500      # extra ms after last sample
//   npm run capture -- --input ... --warmup 800     # ms to let the site settle
//                                                     before frame 0

import puppeteer from 'puppeteer';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { startServer } from './serve.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function parseArgs(argv) {
  const args = { fps: 60, encode: true, tail: 800, warmup: 600 };
  // Boolean flags (no value); anything else takes either `--key=value` or
  // `--key value`. README uses the space form, so accept both.
  const BOOL_FLAGS = new Set(['no-encode']);
  const tokens = argv.slice(2);
  for (let i = 0; i < tokens.length; i++) {
    const a = tokens[i];
    if (a === '--no-encode') { args.encode = false; continue; }
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    if (!m) continue;
    const key = m[1];
    let val = m[2];
    if (val == null) {
      // No `=` form. If the next token isn't a flag, consume it as the value.
      const peek = tokens[i + 1];
      if (peek != null && !peek.startsWith('--')) { val = peek; i++; }
      else if (BOOL_FLAGS.has(key)) { val = 'true'; }
      else { val = 'true'; }
    }
    args[key] = isNaN(+val) || val === 'true' || val === 'false' ? (val === 'true' ? true : val === 'false' ? false : val) : +val;
  }
  return args;
}

function pad(n, w) { return String(n).padStart(w, '0'); }

function ensureEven(n, label) {
  if (n % 2 !== 0) {
    console.warn(`▸ ${label}=${n} is odd; bumping to ${n + 1} so libx264/yuv420p is happy`);
    return n + 1;
  }
  return n;
}

const VIRTUAL_CLOCK = /* js */`
(() => {
  if (window.__bowClockInstalled) return;
  window.__bowClockInstalled = true;

  let vnow = 0;
  const origin = Date.now();
  window.__bowVirtualOrigin = origin;
  window.__bowGetVirtualNow = () => vnow;
  window.__bowSetVirtualNow = (t) => { vnow = t; };

  const rafQueue = new Map();
  let rafId = 0;
  window.requestAnimationFrame = (cb) => {
    const id = ++rafId;
    rafQueue.set(id, cb);
    return id;
  };
  window.cancelAnimationFrame = (id) => rafQueue.delete(id);

  // Drain the rAF queue once with the current virtual time. Callbacks that
  // re-schedule themselves via rAF land in the queue for the *next* tick.
  window.__bowDrainRaf = () => {
    const batch = Array.from(rafQueue.values());
    rafQueue.clear();
    for (const cb of batch) {
      try { cb(vnow); } catch (e) { console.error('rAF callback threw', e); }
    }
  };

  const _perfNow = performance.now.bind(performance);
  performance.now = () => vnow;

  Date.now = () => origin + vnow;

  // setTimeout/setInterval are left on wall-clock; the site uses them only
  // for one-off bootstrap work that finishes before frame 0.
})();
`;

async function loadRecording(file) {
  const raw = await fs.readFile(file, 'utf8');
  const rec = JSON.parse(raw);
  if (!rec.samples || !Array.isArray(rec.samples)) throw new Error('invalid recording: missing samples');
  return rec;
}

function encodeMp4({ framesDir, outFile, fps, pattern }) {
  return new Promise((resolve, reject) => {
    const args = [
      '-y',
      '-framerate', String(fps),
      '-i', path.join(framesDir, pattern),
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
      '-crf', '17',
      '-preset', 'slow',
      '-movflags', '+faststart',
      outFile,
    ];
    const proc = spawn('ffmpeg', args, { stdio: 'inherit' });
    proc.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`)));
    proc.on('error', reject);
  });
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.input) {
    console.error('Usage: npm run capture -- --input recordings/<file>.json [--fps 60] [--width N] [--height N] [--no-encode]');
    process.exit(2);
  }

  const rec = await loadRecording(path.resolve(ROOT, args.input));
  const vp = rec.viewport || { w: 1440, h: 900 };
  const width = ensureEven(+args.width || vp.w, 'width');
  const height = ensureEven(+args.height || vp.h, 'height');
  const fps = +args.fps || 60;
  const frameDt = 1000 / fps;
  const duration = (rec.durationMs || 0) + (+args.tail || 0);
  const frameCount = Math.max(1, Math.ceil(duration / frameDt));

  // DPR upscales the output without changing the page layout. Default to 2
  // when the recording was in capture mode (URL contains ?capture) so a
  // 540×960 recording yields a 1080×1920 MP4 ready for Instagram Reel;
  // --dpr=N overrides explicitly.
  const isCaptureRec = !!(rec.url && /[?&]capture(=|$|&)/.test(rec.url));
  const dpr = +args.dpr || (isCaptureRec ? 2 : 1);
  const outW = width * dpr;
  const outH = height * dpr;

  const runStamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outRoot = args.output ? path.resolve(ROOT, args.output) : path.join(ROOT, 'output', `run-${runStamp}`);
  const framesDir = path.join(outRoot, 'frames');
  await fs.mkdir(framesDir, { recursive: true });

  console.log(`▸ input:     ${path.relative(ROOT, args.input)}`);
  console.log(`▸ viewport:  ${width}×${height}  (recording was ${vp.w}×${vp.h})`);
  console.log(`▸ dpr:       ${dpr}  → output ${outW}×${outH}`);
  console.log(`▸ fps:       ${fps}`);
  console.log(`▸ duration:  ${(duration / 1000).toFixed(2)}s → ${frameCount} frames`);
  console.log(`▸ output:    ${path.relative(ROOT, outRoot)}`);

  const server = await startServer(5174);
  const browser = await puppeteer.launch({
    headless: true,
    defaultViewport: { width, height, deviceScaleFactor: dpr },
    args: [
      `--window-size=${width},${height}`,
      '--hide-scrollbars',
      '--disable-blink-features=AutomationControlled',
      `--force-device-scale-factor=${dpr}`,
      '--no-proxy-server', // skip system proxy (Charles/Proxyman etc.)
    ],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width, height, deviceScaleFactor: dpr });
    await page.evaluateOnNewDocument(VIRTUAL_CLOCK);

    // Carry over the recording's URL query string (e.g. ?capture=1) so the
    // page boots into the same mode it was recorded in.
    let target = server.url;
    if (rec.url) {
      try {
        const recSearch = new URL(rec.url).search;
        if (recSearch) target = server.url.replace(/\/?$/, '/') + recSearch;
      } catch { /* ignore malformed URL in recording */ }
    }

    // Navigate but don't block forever on slow external resources (Google
    // Fonts CSS, the esm.sh pretext module). 'load' is best-effort with a
    // generous timeout; if it doesn't fire we fall through and rely on the
    // warmup window to settle whatever did manage to load.
    try {
      await page.goto(target, { waitUntil: 'load', timeout: 20000 });
    } catch (err) {
      console.warn(`▸ goto(load) didn't fire (${err.message}); pressing on`);
      await page.waitForFunction(() => document.readyState !== 'loading', { timeout: 10000 })
        .catch(() => console.warn('▸ readyState never left "loading"; pressing on'));
    }

    // Let setTimeout-driven bootstrap (font load callbacks, async canvas
    // init) finish in real time first…
    await new Promise((r) => setTimeout(r, +args.warmup || 600));

    // …then tick the virtual rAF for a simulated half second so anything
    // gated on a first paint (e.g. the canvas frame loop deciding it has
    // a backbuffer to draw into) has a chance to run before frame 0.
    await page.evaluate(() => {
      window.scrollTo(0, 0);
      document.dispatchEvent(new MouseEvent('mousemove', { clientX: -9999, clientY: -9999, bubbles: true }));
      const warmupFrames = 30; // ~500 ms at 60fps
      for (let i = 0; i < warmupFrames; i++) {
        window.__bowSetVirtualNow(-1000 + (i + 1) * (1000 / 60));
        window.__bowDrainRaf();
      }
      window.__bowSetVirtualNow(0);
      window.__bowDrainRaf();
    });

    const samples = rec.samples;
    let sIdx = 0;

    process.stdout.write(`▸ rendering frames `);
    const t0Wall = Date.now();
    for (let f = 0; f < frameCount; f++) {
      const vt = f * frameDt;

      // Slice the samples whose timestamp falls in (lastVt, vt]. Applying
      // them all at once keeps each per-frame evaluate fast.
      const pending = [];
      while (sIdx < samples.length && samples[sIdx].t <= vt) {
        pending.push(samples[sIdx]);
        sIdx++;
      }

      await page.evaluate((vt, pending) => {
        for (const s of pending) {
          if (s.type === 'scroll') {
            window.scrollTo(0, s.scrollY);
          } else if (s.type === 'move') {
            document.dispatchEvent(new MouseEvent('mousemove', {
              clientX: s.x, clientY: s.y, bubbles: true, cancelable: true,
            }));
          }
        }
        window.__bowSetVirtualNow(vt);
        window.__bowDrainRaf();
      }, vt, pending);

      const file = path.join(framesDir, `${pad(f, 5)}.png`);
      await page.screenshot({ path: file, type: 'png', omitBackground: false, captureBeyondViewport: false });

      if (f % Math.max(1, Math.floor(fps)) === 0) process.stdout.write('.');
    }
    process.stdout.write(` done in ${((Date.now() - t0Wall) / 1000).toFixed(1)}s\n`);

    if (args.encode) {
      const mp4 = path.join(outRoot, 'video.mp4');
      console.log(`▸ encoding ${path.relative(ROOT, mp4)}`);
      await encodeMp4({ framesDir, outFile: mp4, fps, pattern: '%05d.png' });
      console.log(`▸ done. open ${path.relative(ROOT, mp4)}`);
    } else {
      console.log(`▸ frames in ${path.relative(ROOT, framesDir)} (encoding skipped)`);
    }
  } finally {
    await browser.close();
    await server.close();
  }
}

main().catch((err) => { console.error(err); process.exit(1); });

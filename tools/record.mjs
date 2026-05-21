// Record mode — launches the site in a real Chromium window with the
// recorder overlay injected. Mouse + scroll samples are saved as JSON
// when the user clicks "Save" (or presses D).
//
// Usage: npm run record [-- --width=1440 --height=900]

import puppeteer from 'puppeteer';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './serve.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const RECORDINGS_DIR = path.join(ROOT, 'recordings');

function parseArgs(argv) {
  const args = { width: null, height: null, capture: false, format: 'portrait' };
  const tokens = argv.slice(2);
  for (let i = 0; i < tokens.length; i++) {
    const a = tokens[i];
    if (a === '--capture') { args.capture = true; continue; }
    if (a === '--portrait')  { args.format = 'portrait';  continue; }
    if (a === '--landscape') { args.format = 'landscape'; continue; }
    if (a === '--square')    { args.format = 'square';    continue; }
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    if (!m) continue;
    const key = m[1];
    let val = m[2];
    if (val == null) {
      // Accept `--key value` as well as `--key=value`.
      const peek = tokens[i + 1];
      if (peek != null && !peek.startsWith('--')) { val = peek; i++; }
      else continue;
    }
    args[key] = isNaN(+val) ? val : +val;
  }
  // Capture format → logical viewport. Capture.mjs renders headless at DPR 2,
  // so the final MP4 is 2× the recording viewport in each dimension:
  //   portrait  (default): 540×960  → 1080×1920 (Instagram Reel / Stories)
  //   landscape:           960×540  → 1920×1080 (YouTube, Twitter, web)
  //   square:              720×720  → 1440×1440 (Instagram feed)
  // Recording at the desired aspect ratio is required — replaying a portrait
  // recording at a different ratio would distort mouse positions.
  const FORMATS = {
    portrait:  { w: 540, h: 960 },
    landscape: { w: 960, h: 540 },
    square:    { w: 720, h: 720 },
  };
  const fmt = FORMATS[args.format];
  if (!fmt) {
    console.error(`Unknown --format=${args.format}. Use portrait | landscape | square.`);
    process.exit(2);
  }
  if (args.width == null) args.width = args.capture ? fmt.w : 1440;
  if (args.height == null) args.height = args.capture ? fmt.h : 900;
  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  await fs.mkdir(RECORDINGS_DIR, { recursive: true });

  const server = await startServer(5173);
  console.log(`▸ serving ${ROOT} at ${server.url}`);

  const recorderJs = await fs.readFile(path.join(__dirname, 'recorder.js'), 'utf8');

  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    args: [
      `--window-size=${args.width},${args.height + 90}`,
      '--window-position=0,0',
      '--disable-blink-features=AutomationControlled',
      '--no-proxy-server',
    ],
  });
  const [page] = await browser.pages();
  // DPR 2 matches a Retina display: the wavy-text canvas reads
  // window.devicePixelRatio and sizes its backing buffer accordingly, so DPR
  // 1 made glyphs render at half the screen's physical pixels (the "low-res
  // text" you saw). With DPR 2 the canvas buffer is 1080×1920 and Retina is
  // pixel-for-pixel sharp. Mouse events stay in CSS pixels, so the recording
  // is unaffected.
  await page.setViewport({ width: args.width, height: args.height, deviceScaleFactor: 2 });
  await page.bringToFront();

  await page.exposeFunction('__saveRecording', async (json) => {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const file = path.join(RECORDINGS_DIR, `recording-${stamp}.json`);
    await fs.writeFile(file, json);
    const rel = path.relative(ROOT, file);
    console.log(`▸ saved ${rel}`);
    return rel;
  });

  await page.evaluateOnNewDocument(recorderJs);

  // Optional ghost: replay an older recording during this session so the
  // user can dance with their past self. The page's startCaptureCycle
  // triggers __bowStartGhost at the same instant it kicks the recorder,
  // so both timelines start at t=0 together. Ghost mousemoves are
  // dispatched as real DOM events and get captured by recorder.js too —
  // the saved file ends up containing the merged path, so the final MP4
  // shows both dancers with no extra flag needed at capture time.
  let ghostInfo = '';
  if (args.ghost) {
    const ghostPath = path.resolve(ROOT, args.ghost);
    const ghostJson = JSON.parse(await fs.readFile(ghostPath, 'utf8'));
    const ghostJs = await fs.readFile(path.join(__dirname, 'ghost.js'), 'utf8');
    const injected = `window.__bowGhostSamples = ${JSON.stringify(ghostJson.samples)};\n${ghostJs}`;
    await page.evaluateOnNewDocument(injected);
    ghostInfo = `, ghost from ${path.relative(ROOT, ghostPath)} (${ghostJson.samples.length} samples)`;
  }

  const target = args.capture ? `${server.url}?capture=1` : server.url;
  await page.goto(target, { waitUntil: 'networkidle2' });

  const outW = args.width * 2, outH = args.height * 2;
  console.log(`▸ recorder loaded${args.capture ? ` (capture mode, ${args.format} ${args.width}×${args.height} — output at ${outW}×${outH})` : ''}${ghostInfo}. Hotkeys: R=record, S=stop, D=save. Close the window to exit.`);

  await new Promise((resolve) => browser.on('disconnected', resolve));
  await server.close();
}

main().catch((err) => { console.error(err); process.exit(1); });
